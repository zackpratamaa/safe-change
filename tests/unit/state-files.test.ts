import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir, symlink, link, stat, readdir, open, rename } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readStateFile, writeStateFileAtomically } from "../../src/security/state-files.js";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

describe("private atomic state files", () => {
  let root: string;
  let outside: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "safe-change-state-"));
    outside = await mkdtemp(join(tmpdir(), "safe-change-state-outside-"));
  });
  afterEach(async () => {
    vi.mocked(rename).mockClear();
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });
  it("does not create state during a missing read", async () => {
    expect(await readStateFile(root, "baseline.json")).toBeNull();
    expect(await readdir(root)).toEqual([]);
  });
  it("round-trips Unicode and replaces complete state without leftover temporary files", async () => {
    await writeStateFileAtomically(root, "baseline.json", '{"text":"awal 日本"}\n');
    await writeStateFileAtomically(root, "baseline.json", '{"text":"selesai"}\n');
    expect(await readStateFile(root, "baseline.json")).toBe('{"text":"selesai"}\n');
    expect(await readdir(join(root, ".safe-change"))).toEqual(["baseline.json"]);
  });
  it.skipIf(process.platform === "win32")("creates private files and directories on POSIX", async () => {
    const path = await writeStateFileAtomically(root, "log.json", "[]\n");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(join(root, ".safe-change"))).mode & 0o777).toBe(0o700);
  });
  it("rejects a linked state directory without reading or writing its target", async () => {
    await writeFile(join(outside, "log.json"), "private-external-data");
    await symlink(outside, join(root, ".safe-change"), process.platform === "win32" ? "junction" : "dir");
    await expect(readStateFile(root, "log.json")).rejects.toThrow(/directory/);
    await expect(writeStateFileAtomically(root, "log.json", "[]")).rejects.toThrow(/directory/);
    expect(await readFile(join(outside, "log.json"), "utf8")).toBe("private-external-data");
    expect(await readdir(outside)).toEqual(["log.json"]);
  });
  it.skipIf(process.platform === "win32")("rejects a symbolic-link destination including a dangling link", async () => {
    await mkdir(join(root, ".safe-change"));
    await symlink(join(outside, "absent.json"), join(root, ".safe-change", "log.json"));
    await expect(readStateFile(root, "log.json")).rejects.toThrow(/regular/);
    await expect(writeStateFileAtomically(root, "log.json", "[]")).rejects.toThrow(/regular/);
    expect(await readdir(outside)).toEqual([]);
  });
  it("rejects hard-linked state without changing the linked file", async () => {
    await mkdir(join(root, ".safe-change"));
    const external = join(outside, "history.json");
    await writeFile(external, "original");
    await link(external, join(root, ".safe-change", "log.json"));
    await expect(readStateFile(root, "log.json")).rejects.toThrow(/singly linked/);
    await expect(writeStateFileAtomically(root, "log.json", "[]")).rejects.toThrow(/singly linked/);
    expect(await readFile(external, "utf8")).toBe("original");
  });
  it("rejects directories in place of state files", async () => {
    await mkdir(join(root, ".safe-change", "log.json"), { recursive: true });
    await expect(readStateFile(root, "log.json")).rejects.toThrow(/regular/);
    await expect(writeStateFileAtomically(root, "log.json", "[]")).rejects.toThrow(/regular/);
  });
  it.each(["../escape", "nested/file", "nested\\file", "", ".", ".."])('rejects non-simple names %j', async name => {
    await expect(readStateFile(root, name)).rejects.toThrow(/filename/);
    await expect(writeStateFileAtomically(root, name, "[]")).rejects.toThrow(/filename/);
    expect(await readdir(root)).toEqual([]);
  });
  it("bounds reads of oversized state files", async () => {
    await mkdir(join(root, ".safe-change"));
    const handle = await open(join(root, ".safe-change", "log.json"), "w");
    try { await handle.truncate(64 * 1024 * 1024 + 1); } finally { await handle.close(); }
    await expect(readStateFile(root, "log.json")).rejects.toThrow(/64 MiB/);
  });
  it("preserves the old file and removes its own temporary file on publication failure", async () => {
    await writeStateFileAtomically(root, "log.json", '[{"id":"original"}]');
    vi.mocked(rename).mockRejectedValueOnce(new Error("simulated publication failure"));
    await expect(writeStateFileAtomically(root, "log.json", "[]")).rejects.toThrow(/publication failure/);
    expect(await readStateFile(root, "log.json")).toBe('[{"id":"original"}]');
    expect(await readdir(join(root, ".safe-change"))).toEqual(["log.json"]);
  });
});
