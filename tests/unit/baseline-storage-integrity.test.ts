import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, symlink, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";
import { BaselineError, isStateExcludedFromGit, loadBaseline, saveBaseline } from "../../src/baseline/manager.js";

describe("baseline state boundaries", () => {
  let repo: TempRepo;
  let outside: string;
  beforeEach(async () => {
    repo = await createTempRepo(); outside = await mkdtemp(join(tmpdir(), "safe-change-baseline-outside-"));
    await repo.writeFile(".git/empty-excludes", "");
    await repo.git("config", "core.excludesFile", join(repo.path, ".git", "empty-excludes"));
  });
  afterEach(async () => { await repo.cleanup(); await rm(outside, { recursive: true, force: true }); });
  it("rejects a linked state directory through both baseline APIs", async () => {
    const external = join(outside, "baseline.json");
    await writeFile(external, "external data");
    await symlink(outside, join(repo.path, ".safe-change"), process.platform === "win32" ? "junction" : "dir");
    await expect(loadBaseline(repo.path)).rejects.toThrow(BaselineError);
    const git = { repositoryRoot: repo.path, headCommit: null, headBranch: null, isClean: false };
    await expect(saveBaseline(repo.path, "test", git, {}, [], { version: 1, checks: [] })).rejects.toThrow(BaselineError);
    expect(await readFile(external, "utf8")).toBe("external data");
  });
  it("recognizes anchored effective ignore rules", async () => {
    await repo.writeFile(".gitignore", "/.safe-change/\n");
    expect(await isStateExcludedFromGit(repo.path)).toBe(true);
  });
  it("rejects an apparently matching rule defeated by a later negation", async () => {
    await repo.writeFile(".gitignore", ".safe-change/\n!.safe-change/\n");
    expect(await isStateExcludedFromGit(repo.path)).toBe(false);
  });
  it("does not claim tracked state is excluded even when ignore patterns match", async () => {
    await repo.writeFile(".gitignore", ".safe-change/\n");
    await repo.writeFile(".safe-change/log.json", "[]");
    await repo.git("add", "--force", ".safe-change/log.json");
    expect(await isStateExcludedFromGit(repo.path)).toBe(false);
  });
  it("honors repository-local exclusion rules", async () => {
    await repo.writeFile(".git/info/exclude", ".safe-change/\n");
    expect(await isStateExcludedFromGit(repo.path)).toBe(true);
  });
});
