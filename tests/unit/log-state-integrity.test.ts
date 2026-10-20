import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, readFile, readdir, mkdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { appendEntry, clearLog, createLogEntry, exportLog, getLogFilePath, pruneToRetention, readEntries, updateLastEntry } from "../../src/log/log-manager.js";

function entry(id: string) {
  return createLogEntry({ id, baselineId: "baseline", trigger: "cli", description: id,
    checkResults: [], fileSummary: { added: 0, modified: 0, deleted: 0, unchanged: 1 },
    regressionDetected: false, durationMs: 0 });
}

describe("log mutation integrity", () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "safe-change-log-integrity-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });
  it("preserves every concurrent append within the process", async () => {
    const expected = Array.from({ length: 40 }, (_, index) => entry(`entry-${index}`));
    await Promise.all(expected.map(item => appendEntry(item, root)));
    const actual = await readEntries(root);
    expect(actual).toHaveLength(40);
    expect(new Set(actual.map(item => item.id))).toEqual(new Set(expected.map(item => item.id)));
    expect(await readdir(join(root, ".safe-change"))).toEqual(["log.json"]);
  });
  it("uses one queue for equivalent repository paths", async () => {
    await Promise.all(Array.from({ length: 20 }, (_, index) =>
      appendEntry(entry(`alias-${index}`), index % 2 ? root : relative(process.cwd(), root))));
    expect(await readEntries(root)).toHaveLength(20);
  });
  it("applies retention during concurrent appends without corrupting JSON", async () => {
    await Promise.all(Array.from({ length: 30 }, (_, index) => appendEntry(entry(`limited-${index}`), root, 7)));
    const actual = await readEntries(root);
    expect(actual).toHaveLength(7);
    expect(new Set(actual.map(item => item.id)).size).toBe(7);
  });
  it("serializes concurrent updates and appends without losing records", async () => {
    await appendEntry(entry("initial"), root);
    await Promise.all([
      updateLastEntry({ description: "updated" }, root),
      ...Array.from({ length: 12 }, (_, index) => appendEntry(entry(`later-${index}`), root)),
    ]);
    const actual = await readEntries(root);
    expect(actual).toHaveLength(13);
    expect(actual.some(item => item.description === "updated")).toBe(true);
  });
  it.each(['{"partial":', '{"entries":[]}', '[null]', '[42]'])("does not overwrite corrupt history %j", async raw => {
    await mkdir(join(root, ".safe-change"));
    await writeFile(getLogFilePath(root), raw);
    await expect(appendEntry(entry("new"), root)).rejects.toThrow(/preserved/);
    await expect(updateLastEntry({ description: "new" }, root)).rejects.toThrow(/preserved/);
    await expect(pruneToRetention(1, root)).rejects.toThrow(/preserved/);
    await expect(exportLog(join(root, "export.json"), root)).rejects.toThrow(/preserved/);
    expect(await readFile(getLogFilePath(root), "utf8")).toBe(raw);
    expect(await readdir(root)).toEqual([".safe-change"]);
  });
  it("an unsuccessful mutation does not poison subsequent queued work", async () => {
    await mkdir(join(root, ".safe-change"));
    await writeFile(getLogFilePath(root), "broken");
    await expect(appendEntry(entry("rejected"), root)).rejects.toThrow();
    await clearLog(root);
    await updateLastEntry({ description: "explicit recovery" }, root);
    expect((await readEntries(root))[0]?.description).toBe("explicit recovery");
  });
  it.each([NaN, Infinity, 0, -1, 0.5])("uses a finite default retention for invalid value %s", async retention => {
    await appendEntry(entry("first"), root, retention);
    await appendEntry(entry("second"), root, retention);
    expect(await readEntries(root)).toHaveLength(2);
  });
});
