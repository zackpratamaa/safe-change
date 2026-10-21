import { describe, it, expect, afterEach } from "vitest";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";
import {
  getRepositoryRoot,
  getGitState,
  getFileEntries,
  getDiffText,
  computeFileHash,
  GitError,
} from "../../src/git/inspector.js";
import { symlink, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("git/inspector", () => {
  let repo: TempRepo;

  afterEach(async () => {
    if (repo) await repo.cleanup();
  });

  describe("getRepositoryRoot", () => {
    it("should return the repository root", async () => {
      repo = await createTempRepo();
      const root = await getRepositoryRoot(repo.path);
      // Normalize to handle different path representations
      expect(root).toBeTruthy();
    });

    it("should throw for non-git directory", async () => {
      const { mkdtemp } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const tempDir = await mkdtemp(join(tmpdir(), "sc-notgit-"));
      try {
        await expect(getRepositoryRoot(tempDir)).rejects.toThrow();
      } finally {
        const { rm } = await import("node:fs/promises");
        await rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("getGitState", () => {
    it("should detect a clean repository", async () => {
      repo = await createTempRepo();
      const state = await getGitState(repo.path);
      expect(state.headCommit).toBeTruthy();
      expect(state.isClean).toBe(true);
    });

    it("should detect a dirty repository", async () => {
      repo = await createTempRepo();
      await repo.writeFile("dirty.txt", "uncommitted content");
      const state = await getGitState(repo.path);
      expect(state.isClean).toBe(false);
    });
  });

  describe("getFileEntries", () => {
    it("should include clean tracked files", async () => {
      repo = await createTempRepo();
      await repo.writeFile("tracked.txt", "content");
      await repo.git("add", "tracked.txt");
      await repo.git("commit", "-m", "add file");

      const files = await getFileEntries(repo.path);
      expect(files["tracked.txt"]).toBeDefined();
      expect(files["tracked.txt"]!.tracked).toBe(true);
      expect(files["tracked.txt"]!.status).toBe("clean");
      expect(files["tracked.txt"]!.worktreeHash).toBeTruthy();
    });

    it("should detect modified files with different index and worktree hashes", async () => {
      repo = await createTempRepo();
      await repo.writeFile("file.txt", "original");
      await repo.git("add", "file.txt");
      await repo.git("commit", "-m", "add file");
      await repo.writeFile("file.txt", "modified");

      const files = await getFileEntries(repo.path);
      expect(files["file.txt"]!.status).toBe("modified");
    });

    it("should detect untracked files", async () => {
      repo = await createTempRepo();
      await repo.writeFile("untracked.txt", "new content");

      const files = await getFileEntries(repo.path);
      expect(files["untracked.txt"]).toBeDefined();
      expect(files["untracked.txt"]!.tracked).toBe(false);
      expect(files["untracked.txt"]!.status).toBe("untracked");
    });

    it("consumes the source path of a staged rename without a phantom deletion", async () => {
      repo = await createTempRepo();
      const oldPath = "old-name-with-many-chars.txt";
      const newPath = "renamed unicode-✓ file.txt";
      await repo.writeFile(oldPath, "rename content\n");
      await repo.git("add", oldPath);
      await repo.git("commit", "-m", "add rename source");
      await repo.git("mv", oldPath, newPath);

      const files = await getFileEntries(repo.path);
      expect(files[newPath]).toMatchObject({ tracked: true, status: "staged" });
      expect(files[oldPath]).toBeUndefined();
      expect(files["-name-with-many-chars.txt"]).toBeUndefined();
      expect(Object.keys(files)).toEqual(expect.arrayContaining([newPath]));
    });

    it("should detect staged files", async () => {
      repo = await createTempRepo();
      await repo.writeFile("staged.txt", "staged content");
      await repo.git("add", "staged.txt");

      const files = await getFileEntries(repo.path);
      expect(files["staged.txt"]).toBeDefined();
      expect(files["staged.txt"]!.status).toBe("staged");
    });

    it("should exclude .safe-change/ directory", async () => {
      repo = await createTempRepo();
      await repo.writeFile(".safe-change/baseline.json", "{}");

      const files = await getFileEntries(repo.path);
      expect(files[".safe-change/baseline.json"]).toBeUndefined();
    });

    it("should handle files with spaces in names", async () => {
      repo = await createTempRepo();
      await repo.writeFile("my file.txt", "content with spaces");
      await repo.git("add", "my file.txt");
      await repo.git("commit", "-m", "add file with spaces");

      const files = await getFileEntries(repo.path);
      expect(files["my file.txt"]).toBeDefined();
      expect(files["my file.txt"]!.tracked).toBe(true);
    });

    it("should safely track files named __proto__, constructor, and toString as own keys", async () => {
      repo = await createTempRepo();
      await repo.writeFile("__proto__", "prototype file content");
      await repo.writeFile("constructor", "constructor file content");
      await repo.writeFile("toString", "toString file content");
      await repo.writeFile("normal.txt", "normal content");

      await repo.git("add", "__proto__", "constructor", "toString", "normal.txt");
      await repo.git("commit", "-m", "add special filename files");

      const files = await getFileEntries(repo.path);

      // Verify all keys exist as own properties on the null-prototype dictionary
      const ownKeys = Object.keys(files);
      expect(ownKeys).toContain("__proto__");
      expect(ownKeys).toContain("constructor");
      expect(ownKeys).toContain("toString");
      expect(ownKeys).toContain("normal.txt");

      expect(files["__proto__"]).toBeDefined();
      expect(files["__proto__"]!.tracked).toBe(true);
      expect(files["__proto__"]!.status).toBe("clean");
      expect(files["__proto__"]!.worktreeHash).toBeTruthy();

      expect(files["constructor"]).toBeDefined();
      expect(files["constructor"]!.tracked).toBe(true);
      expect(files["constructor"]!.status).toBe("clean");

      expect(files["toString"]).toBeDefined();
      expect(files["toString"]!.tracked).toBe(true);
      expect(files["toString"]!.status).toBe("clean");
    });
  });

  describe("computeFileHash and symlinks", () => {
    it("should hash symlink target path without reading external file content", async () => {
      // Create external directory and file outside repository
      const externalDir = join(tmpdir(), "sc-external-" + Date.now());
      await mkdir(externalDir, { recursive: true });
      const externalFile = join(externalDir, "secret.txt");
      await writeFile(externalFile, "super secret token that should not be read", "utf-8");

      repo = await createTempRepo();
      const linkPath = join(repo.path, "symlink-to-external");

      try {
        // Use junction on Windows for directory or symlink if permitted
        await symlink(externalDir, linkPath, "junction");
        const hash = await computeFileHash(linkPath);

        expect(hash).toBeTruthy();
        expect(hash.startsWith("sha256:")).toBe(true);
      } finally {
        try {
          await rm(externalDir, { recursive: true, force: true });
        } catch {}
      }
    });

    it("should hash broken symlink target without failing or marking deleted", async () => {
      repo = await createTempRepo();
      const nonExistentTarget = join(repo.path, "does-not-exist-" + Date.now());
      const linkPath = join(repo.path, "broken-link");

      // Junction pointing to non-existent folder
      await symlink(nonExistentTarget, linkPath, "junction");
      const hash = await computeFileHash(linkPath);

      expect(hash).toBeTruthy();
      expect(hash.startsWith("sha256:")).toBe(true);
    });

    it("should detect changed symlink target as a hash change", async () => {
      repo = await createTempRepo();
      const targetDirA = join(repo.path, "target-a");
      const targetDirB = join(repo.path, "target-b");
      await mkdir(targetDirA, { recursive: true });
      await mkdir(targetDirB, { recursive: true });

      const linkPath = join(repo.path, "dynamic-link");
      await symlink(targetDirA, linkPath, "junction");
      const hashA = await computeFileHash(linkPath);

      // Change target
      const { unlink } = await import("node:fs/promises");
      await unlink(linkPath);
      await symlink(targetDirB, linkPath, "junction");
      const hashB = await computeFileHash(linkPath);

      expect(hashA).not.toBe(hashB);
    });
  });

  describe("getDiffText", () => {
    it("should return empty diff for clean repo", async () => {
      repo = await createTempRepo();
      const result = await getDiffText(repo.path);
      expect(result.linesAdded).toBe(0);
      expect(result.linesRemoved).toBe(0);
    });

    it("should show diff for modified files", async () => {
      repo = await createTempRepo();
      await repo.writeFile("file.txt", "original\n");
      await repo.git("add", "file.txt");
      await repo.git("commit", "-m", "add");
      await repo.writeFile("file.txt", "modified\n");

      const result = await getDiffText(repo.path);
      expect(result.linesAdded).toBeGreaterThan(0);
      expect(result.text).toContain("modified");
    });

    it("counts every line in untracked text files", async () => {
      repo = await createTempRepo();
      await repo.writeFile(
        "untracked.txt",
        Array.from({ length: 10_000 }, (_, index) => `line-${index}`).join("\n") + "\n"
      );

      const result = await getDiffText(repo.path);
      expect(result.linesAdded).toBe(10_000);
      expect(result.linesRemoved).toBe(0);
      expect(result.truncated).toBe(true);
    });

    it("does not count untracked binary files as text additions", async () => {
      repo = await createTempRepo();
      await writeFile(join(repo.path, "binary.bin"), Buffer.from([1, 2, 0, 3, 10]));

      const result = await getDiffText(repo.path);
      expect(result.linesAdded).toBe(0);
      expect(result.linesRemoved).toBe(0);
      expect(result.truncated).toBe(true);
    });

    it("should truncate large diffs", async () => {
      repo = await createTempRepo();
      await repo.writeFile("big.txt", "original\n");
      await repo.git("add", "big.txt");
      await repo.git("commit", "-m", "add big");
      const lineCount = 140_000;
      await repo.writeFile(
        "big.txt",
        Array.from({ length: lineCount }, (_, index) =>
          `${String(index).padStart(8, "0")}-${"y".repeat(72)}`
        ).join("\n") + "\n"
      );

      const result = await getDiffText(repo.path, 1000);
      expect(result.truncated).toBe(true);
      expect(result.linesAdded).toBe(lineCount);
      expect(result.linesRemoved).toBe(1);
    });
  });
});
