import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";
import { isStateIgnored, hasTrackedState } from "../../src/git/state-ignore.js";

describe("Git-authoritative state exclusion", () => {
  let repo: TempRepo;
  beforeEach(async () => {
    repo = await createTempRepo();
    await repo.writeFile(".git/empty-excludes", "");
    await repo.git("config", "core.excludesFile", join(repo.path, ".git/empty-excludes"));
  });
  afterEach(async () => { await repo.cleanup(); });
  it.each([
    ["# remember .safe-change/\n", false],
    [".safe-change-backup/\n", false],
    [".safe-change/\n", true],
    ["/.safe-change/\n", true],
    [".safe-change/\n!.safe-change/\n", false],
    [".safe-change/*\n!.safe-change/baseline.json\n", false],
  ])("evaluates real Git rules %j", async (pattern, expected) => {
    await repo.writeFile(".gitignore", pattern as string);
    expect(await isStateIgnored(repo.path)).toBe(expected);
  });
  it("honors Git's repository-local excludes", async () => {
    await repo.writeFile(".git/info/exclude", ".safe-change/\n");
    expect(await isStateIgnored(repo.path)).toBe(true);
  });
  it("distinguishes ignored rules from state already tracked in the index", async () => {
    await repo.writeFile(".gitignore", ".safe-change/\n");
    expect(await hasTrackedState(repo.path)).toBe(false);
    await repo.writeFile(".safe-change/baseline.json", "{}\n");
    expect((await repo.git("add", "--force", ".safe-change/baseline.json")).exitCode).toBe(0);
    expect(await hasTrackedState(repo.path)).toBe(true);
    expect(await isStateIgnored(repo.path)).toBe(true);
  });
  it("does not mask a genuine Git invocation error as an ignore decision", async () => {
    await expect(isStateIgnored(join(repo.path, "missing"))).rejects.toThrow();
  });
});
