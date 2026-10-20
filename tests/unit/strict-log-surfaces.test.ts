import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";
import { runLog } from "../../src/commands/log.js";
import { startDashboardServer } from "../../src/dashboard/server.js";
import { appendEntry, createLogEntry, readEntriesStrict, updateLastEntry } from "../../src/log/log-manager.js";

const entry = () => createLogEntry({ description: null, baselineId: "baseline", trigger: "cli", checkResults: [], fileSummary: { added: 0, modified: 0, deleted: 0, unchanged: 0 }, regressionDetected: false, durationMs: null });
describe("strict public log reads", () => {
  let repo: TempRepo;
  let cwd: string;
  beforeEach(async () => { cwd = process.cwd(); repo = await createTempRepo(); process.chdir(repo.path); });
  afterEach(async () => { vi.restoreAllMocks(); process.chdir(cwd); await repo.cleanup(); });

  it("distinguishes absent history from corrupt JSON in CLI JSON mode", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(await runLog({ format: "json" })).toBe(0);
    expect(stdout.mock.calls.map(call => call[0]).join("").trim()).toBe("[]");
    expect(await readdir(repo.path)).not.toContain(".safe-change");
    stdout.mockClear();
    await repo.writeFile(".safe-change/log.json", "not-json-private-content");
    expect(await runLog({ format: "json" })).toBe(5);
    expect(stdout).not.toHaveBeenCalled();
    const error = stderr.mock.calls.map(call => call[0]).join("");
    expect(error).toMatch(/corrupt/);
    expect(error).not.toContain("not-json-private-content");
    expect(error).not.toContain(repo.path);
  });
  it.each(["terminal", "json"] as const)("rejects malformed entry shapes in %s mode and preserves bytes", async format => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const original = '[{"id":"missing-fields"}]';
    await repo.writeFile(".safe-change/log.json", original);
    expect(await runLog({ format })).toBe(5);
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalled();
    expect(await readFile(join(repo.path, ".safe-change/log.json"), "utf8")).toBe(original);
  });
  it("rejects invalid mutations without damaging previously valid history", async () => {
    await appendEntry(entry(), repo.path);
    const before = await readFile(join(repo.path, ".safe-change/log.json"), "utf8");
    await expect(updateLastEntry({ durationMs: -1 }, repo.path)).rejects.toThrow(/corrupt/);
    await expect(appendEntry({ ...entry(), fileSummary: { added: -1, modified: 0, deleted: 0, unchanged: 0 } }, repo.path)).rejects.toThrow(/corrupt/);
    expect(await readFile(join(repo.path, ".safe-change/log.json"), "utf8")).toBe(before);
    expect(await readdir(join(repo.path, ".safe-change"))).toEqual(["log.json"]);
  });
  it("keeps clear explicit as recovery for corrupt contents", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await repo.writeFile(".safe-change/log.json", "broken");
    expect(await runLog({ format: "json", clear: true, nonInteractive: true })).toBe(0);
    expect(await readEntriesStrict(repo.path)).toEqual([]);
  });
  it("does not turn a locked clear into a successful response", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    // A non-regular marker rejects immediately, without the ordinary 10-second contention wait.
    await repo.writeFile(".safe-change/log-write.lock/marker", "owner");
    expect(await runLog({ format: "json", clear: true, nonInteractive: true })).toBe(5);
    expect(stdout).not.toHaveBeenCalled();
  });
  it("returns 500 for corrupt dashboard API history and 200 [] only when missing", async () => {
    const dashboard = await startDashboardServer({ port: 0, repoRoot: repo.path });
    try {
      const missing = await fetch(`${dashboard.url}/api/log`);
      expect(missing.status).toBe(200);
      expect(await missing.json()).toEqual([]);
      await repo.writeFile(".safe-change/log.json", "private-corrupt-content");
      const corrupt = await fetch(`${dashboard.url}/api/log`);
      expect(corrupt.status).toBe(500);
      expect(await corrupt.json()).toEqual({ error: "Failed to read log entries" });
    } finally { await dashboard.close(); }
  });
});
