import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";
import { runSave } from "../../src/commands/save.js";
import { runCheck } from "../../src/commands/check.js";
import { ExitCodes } from "../../src/types/index.js";

describe("check command rejects damaged local state", () => {
  let repo: TempRepo;
  beforeEach(async () => {
    repo = await createTempRepo();
    await repo.writeFile(".gitignore", ".safe-change/\n");
    await repo.createConfig([{ name: "honest", executable: process.execPath, args: ["-e", "process.exit(0)"], timeout: 5 }]);
    vi.spyOn(process, "cwd").mockReturnValue(repo.path);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(await runSave({ description: "honest baseline", format: "json" })).toBe(ExitCodes.OK);
    expect(await runCheck({ format: "json", strict: true })).toBe(ExitCodes.OK);
  });
  afterEach(async () => { vi.restoreAllMocks(); await repo.cleanup(); });

  it.each(["{broken", "null", '{"schemaVersion":2,"files":{}}'])('rejects corrupt baseline bytes %s', async content => {
    await repo.writeFile(".safe-change/baseline.json", content);
    expect(await runCheck({ format: "json", strict: true })).toBe(ExitCodes.NO_BASELINE);
  });

  it("rejects malformed rules instead of silently dropping them", async () => {
    await repo.writeFile(".safe-change/rules.json", "{broken");
    expect(await runCheck({ format: "json", strict: true })).toBe(ExitCodes.CONFIG_ERROR);
  });
});
