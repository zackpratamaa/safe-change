import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";
import { appendAuditEvent, readAuditEvents, verifyAuditEvents } from "../../src/integrity/audit-log.js";
import { stableDigest } from "../../src/integrity/hash.js";
import { runAudit } from "../../src/commands/audit.js";
import { ExitCodes } from "../../src/types/index.js";

describe("retained audit state corruption and historical-witness limits", () => {
  let repo: TempRepo;
  let path: string;
  beforeEach(async () => {
    repo = await createTempRepo();
    path = join(repo.path, ".safe-change", "events.jsonl");
    await appendAuditEvent(repo.path, "FIRST", "session-test", { accepted: true });
    await appendAuditEvent(repo.path, "SECOND", "session-test", { accepted: false });
  });
  afterEach(async () => { vi.restoreAllMocks(); await repo.cleanup(); });

  it("detects a retained-event edit without digest recomputation", async () => {
    await writeFile(path, (await readFile(path, "utf8")).replace('"type":"FIRST"', '"type":"ALTERED"'));
    expect(verifyAuditEvents(await readAuditEvents(repo.path))).toBe(false);
    await expect(appendAuditEvent(repo.path, "THIRD", null, {})).rejects.toThrow(/corrupt|integrity|invalid/i);
  });

  it("detects reordering and removal from the beginning", async () => {
    const events = await readAuditEvents(repo.path);
    expect(verifyAuditEvents([...events].reverse())).toBe(false);
    expect(verifyAuditEvents(events.slice(1))).toBe(false);
  });

  it.each([null, [], 1, "event", {}, { schemaVersion: 1 }])("rejects malformed JSON event shape %j without throwing", value => {
    expect(verifyAuditEvents([value])).toBe(false);
  });

  it("rejects an unsupported schema even with a matching local digest", async () => {
    const original = (await readAuditEvents(repo.path))[0]!;
    const { eventDigest: _digest, ...fields } = original;
    const changed = { ...fields, schemaVersion: 99 };
    expect(verifyAuditEvents([{ ...changed, eventDigest: stableDigest(changed) }])).toBe(false);
  });

  it("reports invalid JSON as a failing command result, not success or an uncaught read error", async () => {
    await writeFile(path, "{broken\n");
    vi.spyOn(process, "cwd").mockReturnValue(repo.path);
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    expect(await runAudit({ format: "json" })).toBe(ExitCodes.NEW_FAILURE);
    const result = JSON.parse(output.mock.calls.map(call => String(call[0])).join(""));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/invalid JSON/);
  });

  it("reports a changed retained event as a failing command result", async () => {
    await writeFile(path, (await readFile(path, "utf8")).replace('"type":"SECOND"', '"type":"ALTERED"'));
    vi.spyOn(process, "cwd").mockReturnValue(repo.path);
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    expect(await runAudit({ format: "json" })).toBe(ExitCodes.NEW_FAILURE);
    expect(JSON.parse(output.mock.calls.map(call => String(call[0])).join("")).valid).toBe(false);
  });

  it.skipIf(process.platform === "win32")(
    "rejects a symbolic-link audit destination without reading or overwriting its target",
    async () => {
      const outside = join(repo.path, "outside-events.jsonl");
      const original = "outside content\n";
      await writeFile(outside, original);
      await unlink(path);
      await symlink(outside, path);

      await expect(readAuditEvents(repo.path)).rejects.toThrow(/regular|symbolic/i);
      await expect(
        appendAuditEvent(repo.path, "THIRD", null, {})
      ).rejects.toThrow(/regular|symbolic/i);
      expect(await readFile(outside, "utf8")).toBe(original);
    }
  );

  it("documents the limit: a consistent prefix and complete deletion have no local historical witness", async () => {
    const events = await readAuditEvents(repo.path);
    expect(events).toHaveLength(2);
    await writeFile(path, `${JSON.stringify(events[0])}\n`);
    expect(verifyAuditEvents(await readAuditEvents(repo.path))).toBe(true);
    await unlink(path);
    expect(await readAuditEvents(repo.path)).toEqual([]);
    expect(verifyAuditEvents(await readAuditEvents(repo.path))).toBe(true);
  });
});
