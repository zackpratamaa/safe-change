import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT_PATH = resolve("scripts", "sync-version.mjs");

function createMockRepository(baseDir: string, initialVersion = "0.3.1"): void {
  // 1. Root package.json
  writeFileSync(
    join(baseDir, "package.json"),
    JSON.stringify(
      {
        name: "mock-package",
        version: initialVersion,
        optionalDependencies: {
          "@safe-change/win32-x64-msvc": initialVersion,
        },
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );

  // 2. Root package-lock.json
  writeFileSync(
    join(baseDir, "package-lock.json"),
    JSON.stringify(
      {
        name: "mock-package",
        version: initialVersion,
        lockfileVersion: 3,
        packages: {
          "": {
            name: "mock-package",
            version: initialVersion,
            optionalDependencies: {
              "@safe-change/win32-x64-msvc": initialVersion,
            },
          },
        },
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );

  // 3. Cargo.toml
  const cargoDir = join(baseDir, "crates", "safe-change-native");
  mkdirSync(cargoDir, { recursive: true });
  writeFileSync(
    join(cargoDir, "Cargo.toml"),
    `[package]\nname = "safe-change-native"\nversion = "${initialVersion}"\nedition = "2021"\n`,
    "utf-8"
  );

  // 4. npm platform package
  const npmSubDir = join(baseDir, "npm", "win32-x64-msvc");
  mkdirSync(npmSubDir, { recursive: true });
  writeFileSync(
    join(npmSubDir, "package.json"),
    JSON.stringify(
      {
        name: "@safe-change/win32-x64-msvc",
        version: initialVersion,
        os: ["win32"],
        cpu: ["x64"],
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );

  // 5. Dashboard template badge
  const dashboardDir = join(baseDir, "src", "dashboard");
  mkdirSync(dashboardDir, { recursive: true });
  writeFileSync(
    join(dashboardDir, "template.ts"),
    `export const html = '<span class="badge badge-info" style="font-size: 10px; padding: 1px 6px;">v${initialVersion}</span>';\n`,
    "utf-8"
  );

  // 6. Docs
  const docsDir = join(baseDir, "docs");
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(
    join(docsDir, "native-binary-distribution.md"),
    `# Native Distribution\n\n\`\`\`json\n{\n  "version": "${initialVersion}"\n}\n\`\`\`\n`,
    "utf-8"
  );
}

describe("scripts/sync-version.mjs", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "sc-sync-version-test-"));
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("reads root package version and does not downgrade 0.3.1 when no argument is supplied", () => {
    createMockRepository(testDir, "0.3.1");

    const result = spawnSync(process.execPath, [SCRIPT_PATH], {
      cwd: testDir,
      encoding: "utf-8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("v0.3.1");

    const rootPkg = JSON.parse(readFileSync(join(testDir, "package.json"), "utf-8"));
    expect(rootPkg.version).toBe("0.3.1");
    expect(rootPkg.version).not.toBe("0.3.0");
  });

  it("synchronizes all managed files to the explicit valid SemVer supplied", () => {
    createMockRepository(testDir, "0.3.1");

    const result = spawnSync(process.execPath, [SCRIPT_PATH, "0.4.0"], {
      cwd: testDir,
      encoding: "utf-8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("v0.4.0");

    const rootPkg = JSON.parse(readFileSync(join(testDir, "package.json"), "utf-8"));
    expect(rootPkg.version).toBe("0.4.0");
    expect(rootPkg.optionalDependencies["@safe-change/win32-x64-msvc"]).toBe("0.4.0");

    const lock = JSON.parse(readFileSync(join(testDir, "package-lock.json"), "utf-8"));
    expect(lock.version).toBe("0.4.0");
    expect(lock.packages[""].version).toBe("0.4.0");
    expect(lock.packages[""].optionalDependencies["@safe-change/win32-x64-msvc"]).toBe("0.4.0");

    const cargo = readFileSync(join(testDir, "crates", "safe-change-native", "Cargo.toml"), "utf-8");
    expect(cargo).toContain('version = "0.4.0"');

    const npmPkg = JSON.parse(readFileSync(join(testDir, "npm", "win32-x64-msvc", "package.json"), "utf-8"));
    expect(npmPkg.version).toBe("0.4.0");

    const dashboard = readFileSync(join(testDir, "src", "dashboard", "template.ts"), "utf-8");
    expect(dashboard).toContain("v0.4.0</span>");

    const docs = readFileSync(join(testDir, "docs", "native-binary-distribution.md"), "utf-8");
    expect(docs).toContain('"version": "0.4.0"');
  });

  it("ensures repeated execution is idempotent with zero file mutations", () => {
    createMockRepository(testDir, "0.3.1");

    const firstRun = spawnSync(process.execPath, [SCRIPT_PATH], {
      cwd: testDir,
      encoding: "utf-8",
    });
    expect(firstRun.status).toBe(0);

    const filesToWatch = [
      join(testDir, "package.json"),
      join(testDir, "package-lock.json"),
      join(testDir, "crates", "safe-change-native", "Cargo.toml"),
      join(testDir, "npm", "win32-x64-msvc", "package.json"),
      join(testDir, "src", "dashboard", "template.ts"),
      join(testDir, "docs", "native-binary-distribution.md"),
    ];

    const snapshotsBefore = filesToWatch.map((f) => readFileSync(f, "utf-8"));

    const secondRun = spawnSync(process.execPath, [SCRIPT_PATH], {
      cwd: testDir,
      encoding: "utf-8",
    });
    expect(secondRun.status).toBe(0);

    const snapshotsAfter = filesToWatch.map((f) => readFileSync(f, "utf-8"));

    expect(snapshotsAfter).toEqual(snapshotsBefore);
  });

  it("rejects invalid SemVer and exits non-zero without modifying repository files", () => {
    createMockRepository(testDir, "0.3.1");
    const originalPkgContent = readFileSync(join(testDir, "package.json"), "utf-8");

    const result = spawnSync(process.execPath, [SCRIPT_PATH, "invalid-semver-string"], {
      cwd: testDir,
      encoding: "utf-8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Invalid SemVer version");

    const pkgAfter = readFileSync(join(testDir, "package.json"), "utf-8");
    expect(pkgAfter).toBe(originalPkgContent);
  });

  it("check mode returns 0 when all managed versions match and does not modify files", () => {
    createMockRepository(testDir, "0.3.1");

    const pkgBefore = readFileSync(join(testDir, "package.json"), "utf-8");

    const result = spawnSync(process.execPath, [SCRIPT_PATH, "--check"], {
      cwd: testDir,
      encoding: "utf-8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Version parity verified");

    const pkgAfter = readFileSync(join(testDir, "package.json"), "utf-8");
    expect(pkgAfter).toBe(pkgBefore);
  });

  it("check mode returns non-zero when a managed file differs and does not modify files", () => {
    createMockRepository(testDir, "0.3.1");

    // Introduce a version mismatch in a platform package
    const npmPkgPath = join(testDir, "npm", "win32-x64-msvc", "package.json");
    const mismatchedNpmPkg = JSON.parse(readFileSync(npmPkgPath, "utf-8"));
    mismatchedNpmPkg.version = "0.2.0";
    writeFileSync(npmPkgPath, JSON.stringify(mismatchedNpmPkg, null, 2) + "\n", "utf-8");

    const result = spawnSync(process.execPath, [SCRIPT_PATH, "--check"], {
      cwd: testDir,
      encoding: "utf-8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Version parity check failed");
    expect(result.stderr).toContain("win32-x64-msvc");

    // Verify file was NOT modified by check mode
    const npmPkgAfter = JSON.parse(readFileSync(npmPkgPath, "utf-8"));
    expect(npmPkgAfter.version).toBe("0.2.0");
  });

  it("fails safely with actionable English error on malformed package metadata", () => {
    writeFileSync(join(testDir, "package.json"), "{ malformed json content", "utf-8");

    const result = spawnSync(process.execPath, [SCRIPT_PATH], {
      cwd: testDir,
      encoding: "utf-8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Failed to parse package.json");
  });

  it("fails safely with actionable English error when package.json is missing", () => {
    const result = spawnSync(process.execPath, [SCRIPT_PATH], {
      cwd: testDir,
      encoding: "utf-8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("package.json not found");
  });
  it("checks and synchronizes private napi metadata and both new target manifests", () => {
    createMockRepository(testDir, "0.3.1");
    const napiPath = join(testDir, "crates", "safe-change-native", "package.json");
    writeFileSync(napiPath, JSON.stringify({ name: "safe-change-native", private: true, version: "0.1.0" }));
    for (const target of ["linux-arm64-gnu", "linux-x64-musl"]) {
      const dir = join(testDir, "npm", target);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: `@safe-change/${target}`, version: "0.1.0" }));
    }
    const check = spawnSync(process.execPath, [SCRIPT_PATH, "--check"], { cwd: testDir, encoding: "utf8" });
    expect(check.status).toBe(1);
    expect(check.stderr).toContain("crates/safe-change-native/package.json");
    expect(check.stderr).toContain("linux-arm64-gnu");
    expect(check.stderr).toContain("linux-x64-musl");
    const sync = spawnSync(process.execPath, [SCRIPT_PATH, "0.4.0"], { cwd: testDir, encoding: "utf8" });
    expect(sync.status, sync.stderr).toBe(0);
    expect(JSON.parse(readFileSync(napiPath, "utf8"))).toEqual({ name: "safe-change-native", private: true, version: "0.4.0" });
    for (const target of ["linux-arm64-gnu", "linux-x64-musl"]) {
      expect(JSON.parse(readFileSync(join(testDir, "npm", target, "package.json"), "utf8")).version).toBe("0.4.0");
    }
    expect(spawnSync(process.execPath, [SCRIPT_PATH, "--check"], { cwd: testDir }).status).toBe(0);
  });
});
