import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function isValidSemver(version) {
  return typeof version === "string" && SEMVER_REGEX.test(version.trim());
}

export function checkVersionParity({ rootDir = resolve(".") } = {}) {
  const pkgPath = join(rootDir, "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error(`package.json not found at ${pkgPath}`);
  }

  let currentPkg;
  try {
    currentPkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch (error) {
    throw new Error(`Failed to parse package.json: ${error.message}`);
  }

  const expectedVersion = currentPkg.version;
  if (!isValidSemver(expectedVersion)) {
    throw new Error(`Invalid version in package.json: "${expectedVersion}". Must be valid SemVer.`);
  }

  const mismatches = [];

  // 1. Root package.json optionalDependencies
  if (currentPkg.optionalDependencies) {
    for (const [dep, ver] of Object.entries(currentPkg.optionalDependencies)) {
      if (dep.startsWith("@safe-change/") && ver !== expectedVersion) {
        mismatches.push({
          file: "package.json",
          target: `optionalDependencies.${dep}`,
          expected: expectedVersion,
          found: ver,
        });
      }
    }
  }

  // 2. Root package-lock.json
  const lockPath = join(rootDir, "package-lock.json");
  if (existsSync(lockPath)) {
    try {
      const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
      if (lock.version !== expectedVersion) {
        mismatches.push({
          file: "package-lock.json",
          target: "lock.version",
          expected: expectedVersion,
          found: lock.version,
        });
      }
      if (lock.packages && lock.packages[""] && lock.packages[""].version !== expectedVersion) {
        mismatches.push({
          file: "package-lock.json",
          target: 'lock.packages[""].version',
          expected: expectedVersion,
          found: lock.packages[""].version,
        });
      }
      if (lock.packages && lock.packages[""] && lock.packages[""].optionalDependencies) {
        for (const [dep, ver] of Object.entries(lock.packages[""].optionalDependencies)) {
          if (dep.startsWith("@safe-change/") && ver !== expectedVersion) {
            mismatches.push({
              file: "package-lock.json",
              target: `lock.packages[""].optionalDependencies.${dep}`,
              expected: expectedVersion,
              found: ver,
            });
          }
        }
      }
    } catch (error) {
      mismatches.push({
        file: "package-lock.json",
        target: "parse",
        expected: "valid JSON",
        found: error.message,
      });
    }
  }

  // 3. Cargo.toml
  const cargoPath = join(rootDir, "crates", "safe-change-native", "Cargo.toml");
  if (existsSync(cargoPath)) {
    const cargoContent = readFileSync(cargoPath, "utf-8");
    const match = cargoContent.match(/^version\s*=\s*"([^"]+)"/m);
    if (!match) {
      mismatches.push({
        file: "crates/safe-change-native/Cargo.toml",
        target: "package.version",
        expected: expectedVersion,
        found: "missing",
      });
    } else if (match[1] !== expectedVersion) {
      mismatches.push({
        file: "crates/safe-change-native/Cargo.toml",
        target: "package.version",
        expected: expectedVersion,
        found: match[1],
      });
    }
  }

  // The private napi build manifest must not drift from Cargo/root versions.
  const napiPath = join(rootDir, "crates", "safe-change-native", "package.json");
  if (existsSync(napiPath)) {
    try {
      const napi = JSON.parse(readFileSync(napiPath, "utf-8"));
      if (napi.version !== expectedVersion) mismatches.push({
        file: "crates/safe-change-native/package.json", target: "version",
        expected: expectedVersion, found: napi.version,
      });
    } catch (error) {
      mismatches.push({ file: "crates/safe-change-native/package.json", target: "parse",
        expected: "valid JSON", found: error.message });
    }
  }

  // 4. npm platform packages
  const npmDir = join(rootDir, "npm");
  if (existsSync(npmDir)) {
    const entries = readdirSync(npmDir);
    for (const entry of entries) {
      const subPkgPath = join(npmDir, entry, "package.json");
      if (existsSync(subPkgPath) && statSync(subPkgPath).isFile()) {
        try {
          const subPkg = JSON.parse(readFileSync(subPkgPath, "utf-8"));
          if (subPkg.version !== expectedVersion) {
            mismatches.push({
              file: `npm/${entry}/package.json`,
              target: "version",
              expected: expectedVersion,
              found: subPkg.version,
            });
          }
        } catch (error) {
          mismatches.push({
            file: `npm/${entry}/package.json`,
            target: "parse",
            expected: "valid JSON",
            found: error.message,
          });
        }
      }
    }
  }

  // 5. Dashboard template badge
  const templatePath = join(rootDir, "src", "dashboard", "template.ts");
  if (existsSync(templatePath)) {
    const templateContent = readFileSync(templatePath, "utf-8");
    const badgeMatch = templateContent.match(/<span class="badge [^"]*"[^>]*>v([0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?)/);
    if (badgeMatch && badgeMatch[1] !== expectedVersion) {
      mismatches.push({
        file: "src/dashboard/template.ts",
        target: "badge version",
        expected: expectedVersion,
        found: badgeMatch[1],
      });
    }
  }

  // 6. Native binary distribution docs
  const nativeDocPath = join(rootDir, "docs", "native-binary-distribution.md");
  if (existsSync(nativeDocPath)) {
    const nativeDocContent = readFileSync(nativeDocPath, "utf-8");
    const versionMatch = nativeDocContent.match(/"version":\s*"([^"]+)"/);
    if (versionMatch && versionMatch[1] !== expectedVersion) {
      mismatches.push({
        file: "docs/native-binary-distribution.md",
        target: "example version",
        expected: expectedVersion,
        found: versionMatch[1],
      });
    }
  }

  return { expectedVersion, mismatches };
}

export function syncVersion({ rootDir = resolve("."), targetVersion } = {}) {
  const pkgPath = join(rootDir, "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error(`package.json not found at ${pkgPath}`);
  }

  let currentPkg;
  try {
    currentPkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch (error) {
    throw new Error(`Failed to parse package.json: ${error.message}`);
  }

  const resolvedVersion = targetVersion || currentPkg.version;
  if (!isValidSemver(resolvedVersion)) {
    throw new Error(`Invalid SemVer version: "${resolvedVersion}". Expected format like "0.3.1".`);
  }

  const updatedFiles = [];

  // 1. Root package.json
  currentPkg.version = resolvedVersion;
  if (currentPkg.optionalDependencies) {
    for (const dep of Object.keys(currentPkg.optionalDependencies)) {
      if (dep.startsWith("@safe-change/")) {
        currentPkg.optionalDependencies[dep] = resolvedVersion;
      }
    }
  }
  writeFileSync(pkgPath, JSON.stringify(currentPkg, null, 2) + "\n", "utf-8");
  updatedFiles.push(pkgPath);

  // 2. Root package-lock.json
  const lockPath = join(rootDir, "package-lock.json");
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
    lock.version = resolvedVersion;
    if (lock.packages && lock.packages[""]) {
      lock.packages[""].version = resolvedVersion;
      if (lock.packages[""].optionalDependencies) {
        for (const dep of Object.keys(lock.packages[""].optionalDependencies)) {
          if (dep.startsWith("@safe-change/")) {
            lock.packages[""].optionalDependencies[dep] = resolvedVersion;
          }
        }
      }
    }
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n", "utf-8");
    updatedFiles.push(lockPath);
  }

  // 3. Cargo.toml
  const cargoPath = join(rootDir, "crates", "safe-change-native", "Cargo.toml");
  if (existsSync(cargoPath)) {
    let cargoContent = readFileSync(cargoPath, "utf-8");
    cargoContent = cargoContent.replace(/^version\s*=\s*"[^"]+"/m, `version = "${resolvedVersion}"`);
    writeFileSync(cargoPath, cargoContent, "utf-8");
    updatedFiles.push(cargoPath);
  }

  const napiPath = join(rootDir, "crates", "safe-change-native", "package.json");
  if (existsSync(napiPath)) {
    const napi = JSON.parse(readFileSync(napiPath, "utf-8"));
    napi.version = resolvedVersion;
    writeFileSync(napiPath, JSON.stringify(napi, null, 2) + "\n", "utf-8");
    updatedFiles.push(napiPath);
  }

  // 4. npm platform packages
  const npmDir = join(rootDir, "npm");
  if (existsSync(npmDir)) {
    const entries = readdirSync(npmDir);
    for (const entry of entries) {
      const subPkgPath = join(npmDir, entry, "package.json");
      try {
        if (statSync(subPkgPath).isFile()) {
          const subPkg = JSON.parse(readFileSync(subPkgPath, "utf-8"));
          subPkg.version = resolvedVersion;
          writeFileSync(subPkgPath, JSON.stringify(subPkg, null, 2) + "\n", "utf-8");
          updatedFiles.push(subPkgPath);
        }
      } catch {
        // Skip non-directory or unreadable entries
      }
    }
  }

  // 5. Dashboard template badge
  const templatePath = join(rootDir, "src", "dashboard", "template.ts");
  if (existsSync(templatePath)) {
    let templateContent = readFileSync(templatePath, "utf-8");
    templateContent = templateContent.replace(
      /(<span class="badge [^"]*"[^>]*>v)[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?/g,
      `$1${resolvedVersion}`
    );
    writeFileSync(templatePath, templateContent, "utf-8");
    updatedFiles.push(templatePath);
  }

  // 6. Native binary distribution docs
  const nativeDocPath = join(rootDir, "docs", "native-binary-distribution.md");
  if (existsSync(nativeDocPath)) {
    let nativeDocContent = readFileSync(nativeDocPath, "utf-8");
    nativeDocContent = nativeDocContent.replace(/"version":\s*"[^"]+"/g, `"version": "${resolvedVersion}"`);
    writeFileSync(nativeDocPath, nativeDocContent, "utf-8");
    updatedFiles.push(nativeDocPath);
  }

  return { targetVersion: resolvedVersion, updatedFiles };
}

export function main() {
  const args = process.argv.slice(2);
  const isCheckMode = args.includes("--check") || args.includes("-c");
  const versionArg = args.find((arg) => !arg.startsWith("-"));

  try {
    if (isCheckMode) {
      const { expectedVersion, mismatches } = checkVersionParity();
      if (mismatches.length > 0) {
        console.error(`Version parity check failed against reference version v${expectedVersion}:`);
        for (const mismatch of mismatches) {
          console.error(`  - ${mismatch.file} (${mismatch.target}): expected "${mismatch.expected}", found "${mismatch.found}"`);
        }
        process.exit(1);
      }
      console.log(`Version parity verified: all managed files match v${expectedVersion}.`);
      process.exit(0);
    }

    if (versionArg && !isValidSemver(versionArg)) {
      console.error(`Invalid SemVer version: "${versionArg}". Expected format like "0.3.1".`);
      process.exit(1);
    }

    const { targetVersion, updatedFiles } = syncVersion({ targetVersion: versionArg });
    for (const file of updatedFiles) {
      console.log(`Updated ${file}`);
    }
    console.log(`All packages and files successfully synchronized to v${targetVersion}.`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

const isDirectRun = Boolean(
  process.argv[1] &&
    resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
);

if (isDirectRun) {
  main();
}
