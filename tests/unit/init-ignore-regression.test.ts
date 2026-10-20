import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runInit } from "../../src/commands/init.js";
import { isStateIgnored } from "../../src/git/state-ignore.js";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";

describe("init effective Git ignore rules", () => {
  let repo: TempRepo;
  let cwd: string;
  beforeEach(async () => {
    cwd = process.cwd(); repo = await createTempRepo();
    await repo.writeFile(".git/empty-excludes", "");
    await repo.git("config", "core.excludesFile", join(repo.path, ".git/empty-excludes"));
    process.chdir(repo.path);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });
  afterEach(async () => { process.chdir(cwd); vi.restoreAllMocks(); await repo.cleanup(); });
  it.each(["# Add .safe-change/ later\n", ".safe-change-backup/\n", ".safe-change/\n!.safe-change/\n"])(
    "does not mistake %j for an effective exclusion", async (pattern) => {
      await repo.writeFile(".gitignore", pattern);
      expect(await runInit({ format: "json", updateGitignore: true })).toBe(0);
      expect(await isStateIgnored(repo.path)).toBe(true);
      expect(await readFile(join(repo.path, ".gitignore"), "utf8")).toBe(pattern + ".safe-change/\n");
    },
  );
  it("leaves a root-anchored effective rule unchanged", async () => {
    await repo.writeFile(".gitignore", "/.safe-change/\n");
    expect(await runInit({ format: "json", updateGitignore: true })).toBe(0);
    expect(await readFile(join(repo.path, ".gitignore"), "utf8")).toBe("/.safe-change/\n");
  });
  it("does not modify ineffective rules without explicit consent", async () => {
    await repo.writeFile(".gitignore", "# .safe-change/\n");
    expect(await runInit({ format: "json" })).toBe(0);
    expect(await readFile(join(repo.path, ".gitignore"), "utf8")).toBe("# .safe-change/\n");
    expect(await isStateIgnored(repo.path)).toBe(false);
  });
});
