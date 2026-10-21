import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { NATIVE_TARGET_NAMES } from "./native-targets.mjs";

const SEMVER_TAG_REGEX =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export const ACTIVE_NATIVE_TARGETS = NATIVE_TARGET_NAMES;

/**
 * @param {string} [tag]
 * @returns {{ valid: true, version: string } | { valid: false, error: string }}
 */
export function validateTagFormat(tag) {
  if (typeof tag !== "string" || !SEMVER_TAG_REGEX.test(tag.trim())) {
    return {
      valid: false,
      error: `Invalid release tag "${tag}". Tag must match format vMAJOR.MINOR.PATCH (e.g. v0.3.1).`,
    };
  }
  const version = tag.trim().slice(1);
  return { valid: true, version };
}

export function extractChangelogSection(content, targetVersion) {
  const lines = content.split(/\r?\n/);
  let inTargetSection = false;
  const sectionLines = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("## ")) {
      const heading = trimmed.slice(3).trim();
      if (inTargetSection) {
        break;
      }

      const isTarget =
        targetVersion.toLowerCase() === "unreleased"
          ? heading.toLowerCase().startsWith("[unreleased]")
          : heading.startsWith(`[${targetVersion}]`);

      if (isTarget) {
        inTargetSection = true;
        continue;
      }
    }

    if (inTargetSection) {
      sectionLines.push(line);
    }
  }

  if (!inTargetSection) {
    return null;
  }

  let strippedText = "";
  let insideComment = false;

  for (const line of sectionLines) {
    let index = 0;
    let lineOut = "";
    while (index < line.length) {
      if (!insideComment) {
        const commentStart = line.indexOf("<!--", index);
        if (commentStart === -1) {
          lineOut += line.slice(index);
          break;
        }
        lineOut += line.slice(index, commentStart);
        const commentEnd = line.indexOf("-->", commentStart + 4);
        if (commentEnd === -1) {
          insideComment = true;
          break;
        }
        index = commentEnd + 3;
      } else {
        const commentEnd = line.indexOf("-->", index);
        if (commentEnd === -1) {
          break;
        }
        insideComment = false;
        index = commentEnd + 3;
      }
    }
    const trimmedOut = lineOut.trim();
    if (trimmedOut.length > 0) {
      strippedText += (strippedText.length > 0 ? "\n" : "") + trimmedOut;
    }
  }

  return strippedText.trim();
}

/**
 * @typedef {object} ValidateReleaseOptions
 * @property {string} [rootDir]
 * @property {string} [tag]
 * @property {boolean} [allowUnreleased]
 * @property {boolean} [checkGitStatus]
 */

/**
 * @typedef {object} ValidateReleaseResult
 * @property {boolean} valid
 * @property {string} [expectedVersion]
 * @property {string[]} errors
 * @property {string[]} warnings
 */

/**
 * @param {ValidateReleaseOptions} [options]
 * @returns {ValidateReleaseResult}
 */
export function validateRelease({
  rootDir = resolve("."),
  tag = undefined,
  allowUnreleased = false,
  checkGitStatus = true,
} = {}) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  // 1. Tag format
  const tagValidation = validateTagFormat(tag);
  if (!tagValidation.valid) {
    errors.push(tagValidation.error);
    return { valid: false, errors, warnings };
  }
  const expectedVersion = tagValidation.version;

  // 2. Root package.json
  const pkgPath = join(rootDir, "package.json");
  if (!existsSync(pkgPath)) {
    errors.push(`Missing package.json at ${pkgPath}`);
    return { valid: false, errors, warnings };
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch (err) {
    errors.push(`Failed to parse package.json: ${err.message}`);
    return { valid: false, errors, warnings };
  }

  if (pkg.version !== expectedVersion) {
    errors.push(
      `Root package.json version mismatch: expected "${expectedVersion}", found "${pkg.version}".`,
    );
  }

  // Check optionalDependencies for active targets
  const optDeps = pkg.optionalDependencies || {};
  for (const target of ACTIVE_NATIVE_TARGETS) {
    const depName = `@safe-change/${target}`;
    if (!optDeps[depName]) {
      errors.push(
        `Missing required active native optionalDependency: "${depName}".`,
      );
    } else if (optDeps[depName] !== expectedVersion) {
      errors.push(
        `Version mismatch for "${depName}": expected "${expectedVersion}", found "${optDeps[depName]}".`,
      );
    }
  }

  // 3. Root package-lock.json
  const lockPath = join(rootDir, "package-lock.json");
  if (existsSync(lockPath)) {
    try {
      const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
      if (lock.version !== expectedVersion) {
        errors.push(
          `package-lock.json root version mismatch: expected "${expectedVersion}", found "${lock.version}".`,
        );
      }
      if (lock.packages && lock.packages[""]) {
        const rootPkgInLock = lock.packages[""];
        if (rootPkgInLock.version !== expectedVersion) {
          errors.push(
            `package-lock.json packages[""].version mismatch: expected "${expectedVersion}", found "${rootPkgInLock.version}".`,
          );
        }
        const lockOptDeps = rootPkgInLock.optionalDependencies || {};
        for (const target of ACTIVE_NATIVE_TARGETS) {
          const depName = `@safe-change/${target}`;
          if (
            lockOptDeps[depName] &&
            lockOptDeps[depName] !== expectedVersion
          ) {
            errors.push(
              `package-lock.json "${depName}" mismatch: expected "${expectedVersion}", found "${lockOptDeps[depName]}".`,
            );
          }
        }
      }
    } catch (err) {
      errors.push(`Failed to parse package-lock.json: ${err.message}`);
    }
  }

  // 4. Cargo.toml
  const cargoPath = join(rootDir, "crates", "safe-change-native", "Cargo.toml");
  if (existsSync(cargoPath)) {
    const cargoContent = readFileSync(cargoPath, "utf-8");
    const match = cargoContent.match(/^version\s*=\s*"([^"]+)"/m);
    if (!match) {
      errors.push(
        `Version entry missing in crates/safe-change-native/Cargo.toml.`,
      );
    } else if (match[1] !== expectedVersion) {
      errors.push(
        `Cargo.toml version mismatch: expected "${expectedVersion}", found "${match[1]}".`,
      );
    }
  } else {
    errors.push(`Missing crates/safe-change-native/Cargo.toml.`);
  }

  // 5. Active platform packages
  for (const target of ACTIVE_NATIVE_TARGETS) {
    const subPkgPath = join(rootDir, "npm", target, "package.json");
    if (!existsSync(subPkgPath)) {
      errors.push(`Missing platform package.json for target: ${target}`);
      continue;
    }
    try {
      const subPkg = JSON.parse(readFileSync(subPkgPath, "utf-8"));
      if (subPkg.version !== expectedVersion) {
        errors.push(
          `npm/${target}/package.json version mismatch: expected "${expectedVersion}", found "${subPkg.version}".`,
        );
      }
    } catch (err) {
      errors.push(`Failed to parse npm/${target}/package.json: ${err.message}`);
    }
  }

  // 6. Dashboard template badge
  const templatePath = join(rootDir, "src", "dashboard", "template.ts");
  if (existsSync(templatePath)) {
    const templateContent = readFileSync(templatePath, "utf-8");
    const badgeMatch = templateContent.match(
      /<span class="badge badge-info"[^>]*>v([^<]+)<\/span>/,
    );
    if (badgeMatch && badgeMatch[1] !== expectedVersion) {
      errors.push(
        `src/dashboard/template.ts badge version mismatch: expected "${expectedVersion}", found "${badgeMatch[1]}".`,
      );
    }
  }

  // 7. Docs
  const docsPath = join(rootDir, "docs", "native-binary-distribution.md");
  if (existsSync(docsPath)) {
    const docsContent = readFileSync(docsPath, "utf-8");
    const docMatch = docsContent.match(/"version":\s*"([^"]+)"/);
    if (docMatch && docMatch[1] !== expectedVersion) {
      errors.push(
        `docs/native-binary-distribution.md version mismatch: expected "${expectedVersion}", found "${docMatch[1]}".`,
      );
    }
  }

  // 8. Changelog
  const changelogPath = join(rootDir, "CHANGELOG.md");
  if (!existsSync(changelogPath)) {
    errors.push(`Missing CHANGELOG.md.`);
  } else {
    const changelogContent = readFileSync(changelogPath, "utf-8");
    const sectionBody = extractChangelogSection(
      changelogContent,
      expectedVersion,
    );

    if (sectionBody !== null) {
      if (sectionBody.length === 0) {
        errors.push(
          `CHANGELOG.md release section for [${expectedVersion}] is empty.`,
        );
      }
    } else {
      if (allowUnreleased) {
        const unreleasedBody = extractChangelogSection(
          changelogContent,
          "Unreleased",
        );
        if (unreleasedBody !== null) {
          if (unreleasedBody.length === 0) {
            errors.push(
              `CHANGELOG.md has neither [${expectedVersion}] nor non-empty [Unreleased] section.`,
            );
          } else {
            warnings.push(
              `CHANGELOG.md contains changes under [Unreleased] instead of [${expectedVersion}]. Allowed via allowUnreleased/dry-run flag.`,
            );
          }
        } else {
          errors.push(
            `CHANGELOG.md missing release section for [${expectedVersion}] and no [Unreleased] section found.`,
          );
        }
      } else {
        errors.push(
          `CHANGELOG.md does not contain release section for [${expectedVersion}]. Use ## [${expectedVersion}] - YYYY-MM-DD heading.`,
        );
      }
    }
  }

  // 9. Git working tree clean check
  if (checkGitStatus) {
    try {
      const gitStatus = execSync("git status --porcelain", {
        cwd: rootDir,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (gitStatus.length > 0) {
        errors.push(
          `Git working tree is dirty. Release checkout must be clean.`,
        );
      }
    } catch {
      // Not a git repository or git command unavailable; ignore in non-git testing environments
    }
  }

  return {
    valid: errors.length === 0,
    expectedVersion,
    errors,
    warnings,
  };
}

export function main() {
  const args = process.argv.slice(2);
  const allowUnreleased =
    args.includes("--allow-unreleased") || args.includes("--dry-run");
  const noGitCheck = args.includes("--no-git-check");

  const requireTag = args.includes("--require-tag");
  let tag = args.find((a) => !a.startsWith("-"));

  if (!tag && requireTag) {
    console.error(
      "Error: An explicit Git tag is required for production release validation.",
    );
    process.exit(1);
  }

  // Local dry-runs may derive a candidate tag from package.json.
  if (!tag) {
    try {
      const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
      tag = `v${pkg.version}`;
      console.log(
        `No tag argument supplied. Derived tag from package.json: "${tag}"`,
      );
    } catch (err) {
      console.error(`Error: Unable to read root package.json: ${err.message}`);
      process.exit(1);
    }
  }

  console.log(`Validating release prerequisites for tag "${tag}"...`);

  const result = validateRelease({
    tag,
    allowUnreleased,
    checkGitStatus: !noGitCheck,
  });

  if (result.warnings.length > 0) {
    for (const w of result.warnings) {
      console.warn(`[WARN] ${w}`);
    }
  }

  if (!result.valid) {
    console.error(
      `\nRelease validation failed with ${result.errors.length} error(s):`,
    );
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(
    `Release prerequisites validated successfully for v${result.expectedVersion}.`,
  );
  process.exit(0);
}

const isDirectRun = Boolean(
  process.argv[1] &&
  resolve(process.argv[1]).toLowerCase() ===
    fileURLToPath(import.meta.url).toLowerCase(),
);

if (isDirectRun) {
  main();
}
