import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendEntry,
  readEntries,
  pruneToRetention,
  clearLog,
  exportLog,
  createLogEntry,
  getLogFilePath,
} from "../../src/log/log-manager.js";
import type { LogEntry } from "../../src/types/index.js";

describe("Log manager", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "safe-change-log-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeSampleEntry(overrides?: Partial<LogEntry>): LogEntry {
    return createLogEntry({
      description: "sample check",
      baselineId: "test-baseline-id",
      trigger: "cli",
      checkResults: [
        {
          name: "build",
          result: "pass-pass",
          before: "pass",
          now: "pass",
        },
      ],
      fileSummary: { added: 0, modified: 1, deleted: 0, unchanged: 10 },
      regressionDetected: false,
      durationMs: 120,
      ...overrides,
    });
  }

  it("appendEntry saves entry correctly to log.json", async () => {
    const entry = makeSampleEntry({ description: "first baseline" });
    await appendEntry(entry, tempDir);

    const logPath = getLogFilePath(tempDir);
    const raw = await readFile(logPath, "utf-8");
    const parsed = JSON.parse(raw);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe(entry.id);
    expect(parsed[0].description).toBe("first baseline");
    expect(parsed[0].regressionDetected).toBe(false);
  });

  it("readEntries returns ordered array of entries", async () => {
    const entry1 = makeSampleEntry({ description: "entry 1" });
    const entry2 = makeSampleEntry({ description: "entry 2" });
    const entry3 = makeSampleEntry({ description: "entry 3" });

    await appendEntry(entry1, tempDir);
    await appendEntry(entry2, tempDir);
    await appendEntry(entry3, tempDir);

    const entries = await readEntries(tempDir);
    expect(entries).toHaveLength(3);
    expect(entries[0]!.description).toBe("entry 1");
    expect(entries[1]!.description).toBe("entry 2");
    expect(entries[2]!.description).toBe("entry 3");
  });

  it("pruneToRetention removes older entries when exceeding limit", async () => {
    for (let i = 1; i <= 5; i++) {
      await appendEntry(makeSampleEntry({ description: `entry ${i}` }), tempDir, 100);
    }

    await pruneToRetention(3, tempDir);
    const remaining = await readEntries(tempDir);

    expect(remaining).toHaveLength(3);
    expect(remaining[0]!.description).toBe("entry 3");
    expect(remaining[1]!.description).toBe("entry 4");
    expect(remaining[2]!.description).toBe("entry 5");
  });

  it("clearLog empties log.json", async () => {
    await appendEntry(makeSampleEntry({ description: "to be cleared" }), tempDir);
    const before = await readEntries(tempDir);
    expect(before).toHaveLength(1);

    await clearLog(tempDir);
    const after = await readEntries(tempDir);
    expect(after).toEqual([]);
  });

  it("exportLog writes valid JSON file", async () => {
    const entry = makeSampleEntry({ description: "export target" });
    await appendEntry(entry, tempDir);

    const exportPath = join(tempDir, "exported-log.json");
    await exportLog(exportPath, tempDir);

    const raw = await readFile(exportPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].description).toBe("export target");
  });

  it("entry 101 automatically removes entry 1 under default retention", async () => {
    for (let i = 1; i <= 101; i++) {
      await appendEntry(makeSampleEntry({ description: `entry ${i}` }), tempDir, 100);
    }

    const entries = await readEntries(tempDir);
    expect(entries).toHaveLength(100);
    expect(entries[0]!.description).toBe("entry 2");
    expect(entries[99]!.description).toBe("entry 101");
  });

  it("log entry has unique id", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const entry = makeSampleEntry();
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);
    }
    expect(ids.size).toBe(50);
  });

  it("timestamp is valid ISO-8601 string", () => {
    const entry = makeSampleEntry();
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    const parsed = Date.parse(entry.timestamp);
    expect(Number.isNaN(parsed)).toBe(false);
  });

  it("preserves corrupt history until an explicit clear is requested", async () => {
    const validEntry = makeSampleEntry({ description: "clean entry" });
    await appendEntry(validEntry, tempDir);

    const logPath = getLogFilePath(tempDir);
    await writeFile(logPath, '{"broken": [partial json...', "utf-8");

    const recovered = await readEntries(tempDir);
    expect(Array.isArray(recovered)).toBe(true);
    expect(recovered).toEqual([]);

    await expect(appendEntry(makeSampleEntry({ description: "recovered entry" }), tempDir))
      .rejects.toThrow(/preserv/i);
    expect(await readFile(logPath, "utf-8")).toBe('{"broken": [partial json...');
    await clearLog(tempDir);
    await appendEntry(makeSampleEntry({ description: "recovered entry" }), tempDir);
    const afterRecovery = await readEntries(tempDir);
    expect(afterRecovery).toHaveLength(1);
    expect(afterRecovery[0]!.description).toBe("recovered entry");
  });
});
