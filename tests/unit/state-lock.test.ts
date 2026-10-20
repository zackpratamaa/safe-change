import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, mkdir, readFile, writeFile, readdir, link, symlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { withStateLock, StateLockTimeoutError } from "../../src/security/state-lock.js";

describe("cooperative state lock", () => {
  let root: string;
  const name = "log-write.lock";
  const lock = () => join(root, ".safe-change", name);
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "safe-change-lock-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("serializes independent contenders and cleans up its lock", async () => {
    let active = 0;
    let peak = 0;
    const values = await Promise.all(Array.from({ length: 12 }, (_, i) => withStateLock(root, name, async () => {
      active++;
      peak = Math.max(peak, active);
      await delay(2);
      active--;
      return i;
    })));
    expect(peak).toBe(1);
    expect(values).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(await readdir(join(root, ".safe-change"))).toEqual([]);
  });
  it("cleans up after an operation throws and propagates the original error", async () => {
    const failure = new Error("operation failed");
    await expect(withStateLock(root, name, async () => { throw failure; })).rejects.toBe(failure);
    expect(await withStateLock(root, name, async () => 42)).toBe(42);
  });
  it("times out without invoking a blocked operation or stealing an old lock", async () => {
    await mkdir(join(root, ".safe-change"));
    await writeFile(lock(), '{"pid":99999999,"createdAt":"1970-01-01"}');
    const original = await readFile(lock(), "utf8");
    let called = false;
    await expect(withStateLock(root, name, async () => { called = true; }, { timeoutMs: 30 })).rejects.toBeInstanceOf(StateLockTimeoutError);
    expect(called).toBe(false);
    expect(await readFile(lock(), "utf8")).toBe(original);
  });
  it("does not unlink a changed owner record", async () => {
    await expect(withStateLock(root, name, async () => {
      await writeFile(lock(), "replacement owner");
    })).rejects.toThrow(/ownership changed/);
    expect(await readFile(lock(), "utf8")).toBe("replacement owner");
  });
  it("preserves both operation and release failures", async () => {
    const failure = new Error("original operation failure");
    const error = await withStateLock(root, name, async () => {
      await writeFile(lock(), "changed owner");
      throw failure;
    }).catch(error => error);
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors[0]).toBe(failure);
    expect(error.errors[1].message).toMatch(/ownership changed/);
  });
  it("rejects a hard-linked marker without touching either link", async () => {
    await mkdir(join(root, ".safe-change"));
    const original = join(root, "original");
    await writeFile(original, "owner");
    await link(original, lock());
    await expect(withStateLock(root, name, async () => undefined)).rejects.toThrow(/singly linked/);
    expect(await readFile(original, "utf8")).toBe("owner");
  });
  it("rejects a directory instead of a lock", async () => {
    await mkdir(lock(), { recursive: true });
    await expect(withStateLock(root, name, async () => undefined)).rejects.toThrow(/regular/);
  });
  it.skipIf(process.platform === "win32")("rejects a dangling symbolic link", async () => {
    await mkdir(join(root, ".safe-change"));
    await symlink(join(root, "absent"), lock());
    await expect(withStateLock(root, name, async () => undefined)).rejects.toThrow(/regular/);
  });
  it.skipIf(process.platform === "win32")("requests private POSIX marker permissions", async () => {
    await withStateLock(root, name, async () => {
      expect((await stat(lock())).mode & 0o777).toBe(0o600);
      const record = JSON.parse(await readFile(lock(), "utf8"));
      expect(record.pid).toBe(process.pid);
      expect(record.schemaVersion).toBe(1);
      expect(record.token).toMatch(/^[0-9a-f-]{36}$/);
    });
  });
  it.each(["../escape", "nested/path", "nested\\path", "", ".", "..", "x".repeat(129)])("rejects lock filename %j", async name => {
    await expect(withStateLock(root, name, async () => undefined)).rejects.toThrow(/filename/);
    expect(await readdir(root)).toEqual([]);
  });
  it.each([-1, 60_001, 0.5, NaN, Infinity])("rejects invalid timeout %j before state creation", async timeoutMs => {
    await expect(withStateLock(root, name, async () => undefined, { timeoutMs })).rejects.toThrow(/timeout/);
    expect(await readdir(root)).toEqual([]);
  });
  it("permits an immediately available lock with zero wait", async () => {
    expect(await withStateLock(root, name, async () => "done", { timeoutMs: 0 })).toBe("done");
  });
});
