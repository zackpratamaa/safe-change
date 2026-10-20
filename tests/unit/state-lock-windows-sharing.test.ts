import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lstat, open, mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { withStateLock, StateLockTimeoutError } from "../../src/security/state-lock.js";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open), lstat: vi.fn(actual.lstat) };
});
let actual: typeof import("node:fs/promises");
let root: string, marker: string;
const denied = (code: string) => Object.assign(new Error(`fixture ${code}`), { code });
beforeEach(async () => {
  actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(open).mockReset().mockImplementation(actual.open);
  vi.mocked(lstat).mockReset().mockImplementation(actual.lstat);
  root = await mkdtemp(join(tmpdir(), "sc-windows-sharing-"));
  await mkdir(join(root, ".safe-change")); marker = join(root, ".safe-change/log-write.lock");
  vi.spyOn(process, "platform", "get").mockReturnValue("win32");
});
afterEach(async () => {
  vi.mocked(open).mockReset().mockImplementation(actual.open);
  vi.mocked(lstat).mockReset().mockImplementation(actual.lstat);
  vi.restoreAllMocks(); await rm(root, { recursive: true, force: true });
});
function injectOpen(error: Error, persistent: boolean) {
  let attempts = 0;
  vi.mocked(open).mockImplementation((async (path, flags, mode) => {
    if (String(path) === marker && flags === "wx" && (++attempts === 1 || persistent)) throw error;
    return actual.open(path, flags, mode);
  }) as typeof open);
  return () => attempts;
}
function injectInspection(error: Error, transition?: () => Promise<void>) {
  let first = true;
  vi.mocked(lstat).mockImplementation((async path => {
    if (String(path) === marker && first) { first = false; await transition?.(); throw error; }
    return actual.lstat(path);
  }) as typeof lstat);
}
describe("bounded Windows lock acquisition sharing conflicts", () => {
  it.each(["EPERM", "EACCES"])("retries %s on exclusive open but only enters after wx ownership", async code => {
    const attempts = injectOpen(denied(code), false); const operation = vi.fn(async () => "owned");
    expect(await withStateLock(root, "log-write.lock", operation)).toBe("owned");
    expect(attempts()).toBe(2); expect(operation).toHaveBeenCalledOnce();
    expect(await readdir(join(root, ".safe-change"))).toEqual([]);
  });
  it.each(["EPERM", "EACCES"])("retries %s inspecting a marker being removed by its owner", async code => {
    await writeFile(marker, "previous owner"); injectInspection(denied(code), () => actual.unlink(marker));
    const operation = vi.fn(async () => 42);
    expect(await withStateLock(root, "log-write.lock", operation)).toBe(42);
    expect(operation).toHaveBeenCalledOnce(); expect(await readdir(join(root, ".safe-change"))).toEqual([]);
  });
  it.each([0, 35])("persistent denial at %s ms remains fail-closed and preserves the current marker", async timeoutMs => {
    await writeFile(marker, "current owner"); injectOpen(denied("EPERM"), true);
    const operation = vi.fn(async () => undefined);
    await expect(withStateLock(root, "log-write.lock", operation, { timeoutMs })).rejects.toBeInstanceOf(StateLockTimeoutError);
    expect(operation).not.toHaveBeenCalled(); expect(await readFile(marker, "utf8")).toBe("current owner");
  });
  it("persistent inspection denial does not grant ownership or delete the marker", async () => {
    await writeFile(marker, "current owner");
    vi.mocked(lstat).mockImplementation((async path => { if (String(path) === marker) throw denied("EACCES"); return actual.lstat(path); }) as typeof lstat);
    const operation = vi.fn(async () => undefined);
    await expect(withStateLock(root, "log-write.lock", operation, { timeoutMs: 35 })).rejects.toBeInstanceOf(StateLockTimeoutError);
    expect(operation).not.toHaveBeenCalled(); expect(await readFile(marker, "utf8")).toBe("current owner");
  });
  it.each(["EPERM", "EACCES"])("does not retry POSIX exclusive-open %s", async code => {
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    const failure = denied(code), attempts = injectOpen(failure, true); const operation = vi.fn(async () => undefined);
    await expect(withStateLock(root, "log-write.lock", operation)).rejects.toBe(failure);
    expect(attempts()).toBe(1); expect(operation).not.toHaveBeenCalled();
  });
  it.each(["EPERM", "EACCES"])("does not mask POSIX inspection %s", async code => {
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    await writeFile(marker, "current owner"); const failure = denied(code); injectInspection(failure);
    const operation = vi.fn(async () => undefined);
    await expect(withStateLock(root, "log-write.lock", operation)).rejects.toBe(failure);
    expect(operation).not.toHaveBeenCalled(); expect(await readFile(marker, "utf8")).toBe("current owner");
  });
  it("does not retry an unrelated Windows open failure", async () => {
    const failure = denied("ENOSPC"), attempts = injectOpen(failure, true); const operation = vi.fn(async () => undefined);
    await expect(withStateLock(root, "log-write.lock", operation)).rejects.toBe(failure);
    expect(attempts()).toBe(1); expect(operation).not.toHaveBeenCalled();
  });
  it("still rejects a hard-linked successor after a transient inspection error", async () => {
    await writeFile(marker, "previous owner"); const external = join(root, "external"); await writeFile(external, "successor");
    injectInspection(denied("EPERM"), async () => { await actual.unlink(marker); await actual.link(external, marker); });
    const operation = vi.fn(async () => undefined);
    await expect(withStateLock(root, "log-write.lock", operation)).rejects.toThrow(/singly linked/);
    expect(operation).not.toHaveBeenCalled(); expect((await actual.lstat(marker)).nlink).toBe(2);
    expect(await readFile(external, "utf8")).toBe("successor");
  });
  it("still rejects a directory successor after a transient inspection error", async () => {
    await writeFile(marker, "previous owner");
    injectInspection(denied("EACCES"), async () => { await actual.unlink(marker); await actual.mkdir(marker); });
    const operation = vi.fn(async () => undefined);
    await expect(withStateLock(root, "log-write.lock", operation, { timeoutMs: 100 })).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled(); expect((await actual.lstat(marker)).isDirectory()).toBe(true);
  });
  it("does not retry the operation when release fails after mutation", async () => {
    const failure = denied("EPERM"); const operation = vi.fn(async () => {
      vi.mocked(lstat).mockImplementation((async path => { if (String(path) === marker) throw failure; return actual.lstat(path); }) as typeof lstat);
    });
    await expect(withStateLock(root, "log-write.lock", operation)).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledOnce(); expect((await actual.lstat(marker)).isFile()).toBe(true);
  });
  it("never retries a state-directory denial as if it were lock ownership", async () => {
    const failure = denied("EPERM"), operation = vi.fn(async () => undefined);
    vi.mocked(lstat).mockImplementation((async path => { if (String(path) === join(root, ".safe-change")) throw failure; return actual.lstat(path); }) as typeof lstat);
    await expect(withStateLock(root, "log-write.lock", operation)).rejects.toBe(failure);
    expect(operation).not.toHaveBeenCalled(); expect(await readdir(join(root, ".safe-change"))).toEqual([]);
  });
});
