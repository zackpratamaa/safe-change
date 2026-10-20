import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lstat, mkdtemp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { withStateLock, StateLockTimeoutError } from "../../src/security/state-lock.js";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, lstat: vi.fn(actual.lstat) };
});

describe("contender observes an in-flight lock unlink", () => {
  let root: string;
  let marker: string;
  let actual: typeof import("node:fs/promises");
  beforeEach(async () => {
    actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(lstat).mockReset();
    vi.mocked(lstat).mockImplementation(actual.lstat);
    root = await mkdtemp(join(tmpdir(), "safe-change-unlink-race-"));
    await mkdir(join(root, ".safe-change"));
    marker = join(root, ".safe-change", "log-write.lock");
    await writeFile(marker, "original owner");
  });
  afterEach(async () => {
    vi.mocked(lstat).mockReset();
    vi.mocked(lstat).mockImplementation(actual.lstat);
    await rm(root, { recursive: true, force: true });
  });

  function injectUnlinkedSnapshot(transition: () => Promise<void>) {
    let injected = false;
    vi.mocked(lstat).mockImplementation((async (path: Parameters<typeof lstat>[0]) => {
      const snapshot = await actual.lstat(path);
      if (String(path) === marker && !injected) {
        injected = true;
        await transition();
        // Model stat lookup racing the preceding owner's unlink: a regular inode with nlink=0.
        snapshot.nlink = 0;
      }
      return snapshot;
    }) as typeof lstat);
    return () => injected;
  }

  it("retries exclusive creation after a regular zero-link snapshot", async () => {
    const injected = injectUnlinkedSnapshot(() => actual.unlink(marker));
    let calls = 0;
    expect(await withStateLock(root, "log-write.lock", async () => ++calls)).toBe(1);
    expect(injected()).toBe(true);
    expect(calls).toBe(1);
    expect(await readdir(join(root, ".safe-change"))).toEqual([]);
  });

  it.each([0, 40])("keeps the wait bounded at %s ms without stealing a current marker", async timeoutMs => {
    const injected = injectUnlinkedSnapshot(async () => undefined);
    let called = false;
    await expect(withStateLock(root, "log-write.lock", async () => { called = true; }, { timeoutMs }))
      .rejects.toBeInstanceOf(StateLockTimeoutError);
    expect(injected()).toBe(true);
    expect(called).toBe(false);
    expect(await readFile(marker, "utf8")).toBe("original owner");
  });

  it("still rejects a hard-linked successor observed after the transient snapshot", async () => {
    const external = join(root, "external");
    await writeFile(external, "successor owner");
    injectUnlinkedSnapshot(async () => {
      await actual.unlink(marker);
      await actual.link(external, marker);
    });
    let called = false;
    await expect(withStateLock(root, "log-write.lock", async () => { called = true; }))
      .rejects.toThrow(/singly linked/);
    expect(called).toBe(false);
    expect((await actual.lstat(marker)).nlink).toBe(2);
    expect(await readFile(external, "utf8")).toBe("successor owner");
  });

  it.skipIf(process.platform === "win32")("still rejects a symbolic-link successor", async () => {
    const external = join(root, "external");
    await writeFile(external, "successor owner");
    injectUnlinkedSnapshot(async () => {
      await actual.unlink(marker);
      await actual.symlink(external, marker);
    });
    await expect(withStateLock(root, "log-write.lock", async () => undefined)).rejects.toThrow(/regular/);
    expect((await actual.lstat(marker)).isSymbolicLink()).toBe(true);
    expect(await readFile(external, "utf8")).toBe("successor owner");
  });
});
