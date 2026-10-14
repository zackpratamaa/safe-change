import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  installSkillFixture,
  uninstallSkillFixture,
  verifyByteForByteIdentity,
  verifyFrontmatterIntact,
  resolveTargetDir,
  createFixtureWorkspace,
  cleanupFixtureWorkspace,
  isFileSystemCaseInsensitive,
  assertSafeTargetRoot,
  CLASSIFICATION_LABEL,
  FixtureFileSystem,
} from "../fixtures/antigravity-fixture.js";

const CANONICAL_SKILL_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "skills",
  "safe-change",
  "SKILL.md"
);

describe("Antigravity Installation Fixture (Simulation)", () => {
  const trackedTempDirs: string[] = [];

  function makeTrackedWorkspace(prefix?: string): string {
    const dir = createFixtureWorkspace(prefix);
    trackedTempDirs.push(dir);
    return dir;
  }

  let tempWorkspace: string;
  let tempFakeHome: string;

  beforeEach(() => {
    tempWorkspace = makeTrackedWorkspace("safe-change-fixture-proj-");
    tempFakeHome = makeTrackedWorkspace("safe-change-fixture-home-");
  });

  afterEach(() => {
    while (trackedTempDirs.length > 0) {
      const dir = trackedTempDirs.pop();
      if (dir) {
        cleanupFixtureWorkspace(dir);
      }
    }
  });

  it("should install canonical SKILL.md into .agents/skills/safe-change/ with byte-for-byte identity", () => {
    // Set up unrelated project files
    fs.writeFileSync(
      path.join(tempWorkspace, "package.json"),
      JSON.stringify({ name: "my-app", version: "1.0.0" }, null, 2)
    );
    const existingRuleDir = path.join(tempWorkspace, ".agents", "rules");
    fs.mkdirSync(existingRuleDir, { recursive: true });
    const existingRuleFile = path.join(existingRuleDir, "coding-standards.md");
    fs.writeFileSync(existingRuleFile, "# Coding Standards\nRule content");

    const existingOtherSkillDir = path.join(
      tempWorkspace,
      ".agents",
      "skills",
      "other-tool"
    );
    fs.mkdirSync(existingOtherSkillDir, { recursive: true });
    const existingOtherSkillFile = path.join(existingOtherSkillDir, "SKILL.md");
    fs.writeFileSync(existingOtherSkillFile, "---\nname: other-tool\n---\nOther");

    // Execute installation fixture
    const result = installSkillFixture({
      scope: "project",
      targetRoot: tempWorkspace,
      sourceSkillFile: CANONICAL_SKILL_PATH,
    });

    expect(result.status).toBe("installed");
    expect(result.classification).toBe(CLASSIFICATION_LABEL);

    const installedFile = result.installedPath;
    expect(fs.existsSync(installedFile)).toBe(true);

    // Verify byte-for-byte identity
    const isIdentical = verifyByteForByteIdentity(
      CANONICAL_SKILL_PATH,
      installedFile
    );
    expect(isIdentical).toBe(true);

    // Verify frontmatter remains intact
    const frontmatter = verifyFrontmatterIntact(installedFile);
    expect(frontmatter.intact).toBe(true);
    expect(frontmatter.name).toBe("safe-change");
    expect(frontmatter.description).toBeDefined();
    expect(frontmatter.description?.length).toBeGreaterThan(10);

    // Verify skill directory name is strictly 'safe-change'
    const parentDirName = path.basename(path.dirname(installedFile));
    expect(parentDirName).toBe("safe-change");

    // Verify unrelated project files are completely untouched
    expect(
      fs.readFileSync(path.join(tempWorkspace, "package.json"), "utf-8")
    ).toContain('"name": "my-app"');
    expect(fs.readFileSync(existingRuleFile, "utf-8")).toBe(
      "# Coding Standards\nRule content"
    );
    expect(fs.readFileSync(existingOtherSkillFile, "utf-8")).toBe(
      "---\nname: other-tool\n---\nOther"
    );

    // Verify no symlinks or junctions are used
    const statTargetDir = fs.lstatSync(path.dirname(installedFile));
    expect(statTargetDir.isSymbolicLink()).toBe(false);
    const statInstalledFile = fs.lstatSync(installedFile);
    expect(statInstalledFile.isSymbolicLink()).toBe(false);
  });

  it("should detect existing safe-change directory and prevent overwrite without explicit flag", () => {
    const targetDir = resolveTargetDir("project", tempWorkspace);
    fs.mkdirSync(targetDir, { recursive: true });
    const preExistingFile = path.join(targetDir, "SKILL.md");
    fs.writeFileSync(preExistingFile, "CUSTOM PRE-EXISTING CONTENT");

    const result = installSkillFixture({
      scope: "project",
      targetRoot: tempWorkspace,
      sourceSkillFile: CANONICAL_SKILL_PATH,
      overwrite: false,
    });

    expect(result.status).toBe("collision_detected");
    expect(result.bytesWritten).toBe(0);

    // Verify existing content was not overwritten
    const content = fs.readFileSync(preExistingFile, "utf-8");
    expect(content).toBe("CUSTOM PRE-EXISTING CONTENT");
  });

  it("should leave target unchanged when installation is cancelled", () => {
    const targetDir = resolveTargetDir("project", tempWorkspace);
    fs.mkdirSync(targetDir, { recursive: true });
    const preExistingFile = path.join(targetDir, "SKILL.md");
    fs.writeFileSync(preExistingFile, "ORIGINAL UNCHANGED CONTENT");

    const result = installSkillFixture({
      scope: "project",
      targetRoot: tempWorkspace,
      sourceSkillFile: CANONICAL_SKILL_PATH,
      cancel: true,
    });

    expect(result.status).toBe("cancelled");
    expect(result.bytesWritten).toBe(0);

    // Verify target file remained unchanged
    const content = fs.readFileSync(preExistingFile, "utf-8");
    expect(content).toBe("ORIGINAL UNCHANGED CONTENT");
  });

  it("should explicitly update existing installation when overwrite is approved", () => {
    const targetDir = resolveTargetDir("project", tempWorkspace);
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "SKILL.md");
    fs.writeFileSync(targetFile, "OUTDATED VERSION");

    const result = installSkillFixture({
      scope: "project",
      targetRoot: tempWorkspace,
      sourceSkillFile: CANONICAL_SKILL_PATH,
      overwrite: true,
    });

    expect(result.status).toBe("updated");
    expect(result.bytesWritten).toBeGreaterThan(100);

    // Verify file is now byte-for-byte identical to canonical
    expect(verifyByteForByteIdentity(CANONICAL_SKILL_PATH, targetFile)).toBe(
      true
    );
  });

  it("should cleanly uninstall skill directory without removing parent directories or other skills", () => {
    const targetDir = resolveTargetDir("project", tempWorkspace);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, "SKILL.md"), "TO BE REMOVED");

    const otherSkillDir = path.join(
      tempWorkspace,
      ".agents",
      "skills",
      "sibling-skill"
    );
    fs.mkdirSync(otherSkillDir, { recursive: true });
    fs.writeFileSync(path.join(otherSkillDir, "SKILL.md"), "KEEP ME");

    const result = uninstallSkillFixture({
      scope: "project",
      targetRoot: tempWorkspace,
    });

    expect(result.status).toBe("uninstalled");
    expect(fs.existsSync(targetDir)).toBe(false);

    // Parent .agents/skills/ directory must still exist
    const skillsParentDir = path.join(tempWorkspace, ".agents", "skills");
    expect(fs.existsSync(skillsParentDir)).toBe(true);

    // Sibling skill must remain intact
    expect(fs.existsSync(path.join(otherSkillDir, "SKILL.md"))).toBe(true);
    expect(
      fs.readFileSync(path.join(otherSkillDir, "SKILL.md"), "utf-8")
    ).toBe("KEEP ME");
  });

  it("should return not_found when uninstalling non-existent skill", () => {
    const result = uninstallSkillFixture({
      scope: "project",
      targetRoot: tempWorkspace,
    });

    expect(result.status).toBe("not_found");
  });

  it("should maintain strict isolation between project scope and global scope", () => {
    // Project install
    const projResult = installSkillFixture({
      scope: "project",
      targetRoot: tempWorkspace,
      sourceSkillFile: CANONICAL_SKILL_PATH,
    });
    expect(projResult.status).toBe("installed");

    // Verify no files were created in fakeHome
    expect(fs.existsSync(path.join(tempFakeHome, ".gemini"))).toBe(false);

    // Global install in simulated home
    const globalResult = installSkillFixture({
      scope: "global",
      targetRoot: tempFakeHome,
      sourceSkillFile: CANONICAL_SKILL_PATH,
    });
    expect(globalResult.status).toBe("installed");

    // Verify project workspace has no global path
    expect(fs.existsSync(path.join(tempWorkspace, ".gemini"))).toBe(false);

    // Verify simulated global target is present
    const globalTarget = path.join(
      tempFakeHome,
      ".gemini",
      "config",
      "skills",
      "safe-change",
      "SKILL.md"
    );
    expect(fs.existsSync(globalTarget)).toBe(true);
    expect(
      verifyByteForByteIdentity(CANONICAL_SKILL_PATH, globalTarget)
    ).toBe(true);
  });

  it("should throw safety violation if targetRoot is the real user home directory", () => {
    const realHomeSkill = path.join(
      os.homedir(),
      ".gemini",
      "config",
      "skills",
      "safe-change"
    );
    const existedBefore = fs.existsSync(realHomeSkill);

    expect(() => {
      installSkillFixture({
        scope: "global",
        targetRoot: os.homedir(),
      });
    }).toThrow(/Safety violation/);

    expect(() => {
      uninstallSkillFixture({
        scope: "global",
        targetRoot: os.homedir(),
      });
    }).toThrow(/Safety violation/);

    // Real home directory must remain untouched
    expect(fs.existsSync(realHomeSkill)).toBe(existedBefore);
  });

  it("should correctly handle target paths containing spaces", () => {
    const spaceWorkspace = makeTrackedWorkspace("safe change space test-");

    const result = installSkillFixture({
      scope: "project",
      targetRoot: spaceWorkspace,
      sourceSkillFile: CANONICAL_SKILL_PATH,
    });

    expect(result.status).toBe("installed");
    expect(fs.existsSync(result.installedPath)).toBe(true);
    expect(
      verifyByteForByteIdentity(CANONICAL_SKILL_PATH, result.installedPath)
    ).toBe(true);

    const uninstallResult = uninstallSkillFixture({
      scope: "project",
      targetRoot: spaceWorkspace,
    });
    expect(uninstallResult.status).toBe("uninstalled");
    expect(fs.existsSync(result.installedPath)).toBe(false);
  });

  it("should reliably clean temporary directories in all scenarios", () => {
    const tempDirToClean = makeTrackedWorkspace("safe-change-clean-test-");
    expect(fs.existsSync(tempDirToClean)).toBe(true);

    cleanupFixtureWorkspace(tempDirToClean);
    expect(fs.existsSync(tempDirToClean)).toBe(false);

    // Calling cleanup on already cleaned directory should not throw
    expect(() => cleanupFixtureWorkspace(tempDirToClean)).not.toThrow();
  });

  // Focused Security Tests Added to Address Blockers

  it("should reject targetRoot when it is a direct child, nested descendant, or case-variant of real home", () => {
    const realHomeSkill = path.join(
      os.homedir(),
      ".gemini",
      "config",
      "skills",
      "safe-change"
    );
    const existedBeforeHomeCheck = fs.existsSync(realHomeSkill);

    // Direct child of home
    const childOfHome = path.join(os.homedir(), "child-project");
    expect(() => {
      installSkillFixture({
        scope: "project",
        targetRoot: childOfHome,
      });
    }).toThrow(/Safety violation/);

    // Nested descendant of home
    const nestedDescendant = path.join(
      os.homedir(),
      "documents",
      "code",
      "subproject"
    );
    expect(() => {
      installSkillFixture({
        scope: "project",
        targetRoot: nestedDescendant,
      });
    }).toThrow(/Safety violation/);

    // System temp directory root itself
    expect(() => {
      installSkillFixture({
        scope: "project",
        targetRoot: os.tmpdir(),
      });
    }).toThrow(/Safety violation/);

    // Platform-aware case variant handling:
    // On case-insensitive filesystems (Windows, macOS APFS default), case-variants resolve to the same path and must be rejected.
    // On case-sensitive filesystems (Linux), case-variants represent distinct filesystem paths and are not falsely aliased.
    const isInsensitive = isFileSystemCaseInsensitive();
    if (isInsensitive) {
      expect(() => {
        installSkillFixture({
          scope: "global",
          targetRoot: os.homedir().toUpperCase(),
        });
      }).toThrow(/Safety violation/);

      expect(() => {
        installSkillFixture({
          scope: "global",
          targetRoot: os.homedir().toLowerCase(),
        });
      }).toThrow(/Safety violation/);
    } else {
      // Document and verify that on case-sensitive filesystems (e.g. Linux ext4/btrfs):
      // Detection returns false, and an alternate-case path is distinct from real home
      // and not falsely claimed to be the home directory.
      expect(isInsensitive).toBe(false);
      expect(() => {
        assertSafeTargetRoot(os.homedir().toUpperCase());
      }).not.toThrow();
    }

    // Real home must remain untouched
    expect(fs.existsSync(realHomeSkill)).toBe(existedBeforeHomeCheck);
  });

  it("should reject paths using .. traversal resolving into the real home directory", () => {
    const realHomeSkill = path.join(
      os.homedir(),
      ".gemini",
      "config",
      "skills",
      "safe-change"
    );
    const existedBeforeTraversalCheck = fs.existsSync(realHomeSkill);

    // Traversal resolving to home
    const traversalToHome = path.join(os.homedir(), "projects", "..");
    expect(() => {
      installSkillFixture({
        scope: "project",
        targetRoot: traversalToHome,
      });
    }).toThrow(/Safety violation/);

    // Traversal resolving to a home subdirectory
    const traversalInsideHome = path.join(
      os.homedir(),
      "folderA",
      "..",
      "folderB"
    );
    expect(() => {
      installSkillFixture({
        scope: "project",
        targetRoot: traversalInsideHome,
      });
    }).toThrow(/Safety violation/);

    // Real home must remain untouched
    expect(fs.existsSync(realHomeSkill)).toBe(existedBeforeTraversalCheck);
  });

  it("should reject target directory that is a symlink or junction pointing outside fixture", () => {
    const outsideTarget = makeTrackedWorkspace("outside-symlink-target-");
    const skillsParent = path.join(tempWorkspace, ".agents", "skills");
    fs.mkdirSync(skillsParent, { recursive: true });

    const linkPath = path.join(skillsParent, "safe-change");

    // Create a directory symlink / junction pointing outside the fixture
    const symlinkType = process.platform === "win32" ? "junction" : "dir";
    fs.symlinkSync(outsideTarget, linkPath, symlinkType);

    // installSkillFixture must reject the symlink
    expect(() => {
      installSkillFixture({
        scope: "project",
        targetRoot: tempWorkspace,
        sourceSkillFile: CANONICAL_SKILL_PATH,
      });
    }).toThrow(/Safety violation.*symbolic link/i);

    // Verify outside directory was never modified
    expect(fs.readdirSync(outsideTarget)).toHaveLength(0);

    // uninstallSkillFixture must also reject the symlink rather than traversing it
    expect(() => {
      uninstallSkillFixture({
        scope: "project",
        targetRoot: tempWorkspace,
      });
    }).toThrow(/Safety violation.*symbolic link/i);

    // Verify outside directory was not deleted
    expect(fs.existsSync(outsideTarget)).toBe(true);
  });

  it("should reject file symlinks and TOCTOU replacement attacks using filesystem seam", () => {
    const targetDir = resolveTargetDir("project", tempWorkspace);
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, "SKILL.md");
    fs.writeFileSync(targetFile, "dummy");

    // Mock filesystem simulating a symbolic link for the target file
    const mockFileSymlinkFs: FixtureFileSystem = {
      ...fs,
      lstatSync: (p: string) => {
        if (p === targetFile) {
          return {
            isSymbolicLink: () => true,
            isDirectory: () => false,
            isFile: () => false,
          };
        }
        return fs.lstatSync(p);
      },
    };

    expect(() => {
      installSkillFixture({
        scope: "project",
        targetRoot: tempWorkspace,
        sourceSkillFile: CANONICAL_SKILL_PATH,
        overwrite: true,
        fsImpl: mockFileSymlinkFs,
      });
    }).toThrow(/Safety violation.*Target file.*symbolic link/i);

    // Mock filesystem simulating TOCTOU replacement between directory creation and file write
    let mkdirCalled = false;
    const mockToctouFs: FixtureFileSystem = {
      ...fs,
      mkdirSync: (p: string, opts?: any) => {
        mkdirCalled = true;
        return fs.mkdirSync(p, opts);
      },
      lstatSync: (p: string) => {
        if (mkdirCalled && p === targetDir) {
          return {
            isSymbolicLink: () => true,
            isDirectory: () => false,
            isFile: () => false,
          };
        }
        return fs.lstatSync(p);
      },
    };

    expect(() => {
      installSkillFixture({
        scope: "project",
        targetRoot: tempWorkspace,
        sourceSkillFile: CANONICAL_SKILL_PATH,
        overwrite: true,
        fsImpl: mockToctouFs,
      });
    }).toThrow(/Safety violation.*Target directory.*replaced with a symbolic link/i);
  });

  it("should detect regular-file collision where a directory was expected without overwriting", () => {
    const skillsParent = path.join(tempWorkspace, ".agents", "skills");
    fs.mkdirSync(skillsParent, { recursive: true });

    // Place a regular file at .agents/skills/safe-change
    const regularFilePath = path.join(skillsParent, "safe-change");
    fs.writeFileSync(regularFilePath, "I AM A REGULAR FILE");

    const result = installSkillFixture({
      scope: "project",
      targetRoot: tempWorkspace,
      sourceSkillFile: CANONICAL_SKILL_PATH,
      overwrite: false,
    });

    expect(result.status).toBe("collision_detected");
    expect(result.bytesWritten).toBe(0);
    expect(result.message).toMatch(/regular file.*directory was expected/i);

    // Verify the regular file was untouched
    expect(fs.readFileSync(regularFilePath, "utf-8")).toBe("I AM A REGULAR FILE");
  });

  it("should report cleanup failure explicitly and never silently pass when deletion fails", () => {
    const dummyDir = path.join(tempWorkspace, "dummy-cleanup");
    fs.mkdirSync(dummyDir);

    // Mock filesystem that simulates rmSync failure
    const failingFs = {
      existsSync: () => true,
      rmSync: () => {
        throw new Error("EPERM: operation not permitted");
      },
    };

    expect(() => {
      cleanupFixtureWorkspace(dummyDir, {
        fsImpl: failingFs,
        maxRetries: 1,
        retryDelayMs: 5,
      });
    }).toThrow(/Cleanup failure: Failed to remove temporary directory/i);
  });
});
