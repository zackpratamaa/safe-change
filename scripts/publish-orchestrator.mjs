import {
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
  mkdirSync,
  copyFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { isValidSemver } from "./sync-version.mjs";

export const ACTIVE_TARGETS = [
  "linux-x64-gnu",
  "linux-arm64-gnu",
  "linux-x64-musl",
  "win32-x64-msvc",
  "darwin-arm64",
  "darwin-x64",
];

function encodePackageName(pkgName) {
  return encodeURIComponent(pkgName);
}

export async function getPackageVersionStatus(
  pkgName,
  version,
  registry = "https://registry.npmjs.org"
) {
  const url = `${registry.replace(/\/$/, "")}/${encodePackageName(pkgName)}/${version}`;
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (response.status === 404) return { status: "not_published", pkgName, version };
    if (response.status !== 200) {
      return { status: "registry_error", pkgName, version, code: response.status };
    }
    const metadata = await response.json();
    return {
      status: "published",
      pkgName,
      version,
      metadata,
    };
  } catch (error) {
    return { status: "network_error", pkgName, version, error: error.message };
  }
}

export async function pollPackageVisibility(
  pkgName,
  version,
  registry = "https://registry.npmjs.org",
  maxAttempts = 12,
  delayMs = 5000
) {
  const url = `${registry.replace(/\/$/, "")}/${encodePackageName(pkgName)}/${version}`;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (response.status === 200) return true;
      if (response.status !== 404) return false;
    } catch {
      // Retry transient network failures until the bounded attempt limit.
    }
    if (attempt < maxAttempts) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
    }
  }
  return false;
}

export function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function copyNativeArtifacts(rootDir = resolve(".")) {
  const artifactsDir = join(rootDir, "artifacts");
  if (!existsSync(artifactsDir)) return;

  for (const target of ACTIVE_TARGETS) {
    const artifactFolder = join(artifactsDir, `native-binary-${target}`);
    const targetDir = join(rootDir, "npm", target);
    if (!existsSync(artifactFolder)) continue;

    const nodeFiles = readdirSync(artifactFolder).filter((file) => file.endsWith(".node"));
    if (nodeFiles.length !== 1) {
      throw new Error(`Expected exactly one native binary for ${target}, found ${nodeFiles.length}.`);
    }
    mkdirSync(targetDir, { recursive: true });
    copyFileSync(join(artifactFolder, nodeFiles[0]), join(targetDir, "safe-change-native.node"));
  }
}

export function createPackageTarball(pkgDir, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const output = execFileSync(
    npmCmd,
    ["pack", "--json", "--pack-destination", outputDir],
    { cwd: pkgDir, encoding: "utf-8", shell: process.platform === "win32" }
  );
  const result = JSON.parse(output);
  if (!Array.isArray(result) || result.length !== 1 || !result[0].filename) {
    throw new Error(`npm pack did not return one tarball for ${pkgDir}.`);
  }
  const tarballPath = join(outputDir, basename(result[0].filename));
  if (!existsSync(tarballPath) || statSync(tarballPath).size === 0) {
    throw new Error(`Packed tarball is missing or empty: ${tarballPath}`);
  }
  return {
    path: tarballPath,
    name: result[0].name,
    version: result[0].version,
    files: (result[0].files || []).map((file) => file.path),
    sha256: sha256File(tarballPath),
  };
}

export function findRootTarball(rootDir, packageName, version) {
  const expected = `${packageName.replace(/^@/, "").replace(/\//g, "-")}-${version}.tgz`;
  const matches = readdirSync(rootDir).filter((file) => file === expected);
  if (matches.length !== 1) {
    throw new Error(`Expected exact root tarball "${expected}", found ${matches.length}.`);
  }
  const path = join(rootDir, matches[0]);
  if (statSync(path).size === 0) throw new Error(`Root tarball is empty: ${expected}`);
  return { path, sha256: sha256File(path) };
}

export async function determineReleaseMode(
  version,
  registry = "https://registry.npmjs.org"
) {
  const root = await getPackageVersionStatus("safe-change", version, registry);
  const native = [];
  for (const target of ACTIVE_TARGETS) {
    native.push(await getPackageVersionStatus(`@safe-change/${target}`, version, registry));
  }
  const failures = [root, ...native].filter((item) =>
    ["registry_error", "network_error"].includes(item.status)
  );
  if (failures.length > 0) {
    throw new Error(`Registry state could not be determined for ${failures.map((x) => x.pkgName).join(", ")}.`);
  }
  const nativePublished = native.filter((item) => item.status === "published").length;
  if (root.status === "not_published" && nativePublished === 0) return "full";
  if (root.status === "not_published" && nativePublished === native.length) return "root-recovery";
  if (root.status === "published" && nativePublished === native.length) return "complete";
  throw new Error(
    `Unsafe mixed release state: root=${root.status}, native published=${nativePublished}/${native.length}.`
  );
}

export function buildPublishArgs(tarballPath, version, isCI) {
  if (!isValidSemver(version)) throw new Error("Invalid publication version");
  const tag = version.split("+")[0].includes("-") ? "preview" : "latest";
  const args = ["publish", tarballPath, "--access", "public", "--tag", tag];
  if (isCI) args.push("--provenance");
  return args;
}

function publishTarball(tarballPath, version) {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const isCI = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
  const args = buildPublishArgs(tarballPath, version, isCI);
  execFileSync(npmCmd, args, {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
}

export async function orchestrateNativePublish({
  rootDir = resolve("."),
  dryRun = false,
  registry = "https://registry.npmjs.org",
} = {}) {
  const rootPkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf-8"));
  const version = rootPkg.version;
  copyNativeArtifacts(rootDir);
  const outputDir = join(rootDir, "release-tarballs");

  for (const target of ACTIVE_TARGETS) {
    const pkgName = `@safe-change/${target}`;
    const status = await getPackageVersionStatus(pkgName, version, registry);
    if (status.status === "published") {
      console.log(`Skipping immutable package already on registry: ${pkgName}@${version}`);
      continue;
    }
    if (status.status !== "not_published") {
      throw new Error(`Cannot determine publication state for ${pkgName}@${version}.`);
    }

    const targetDir = join(rootDir, "npm", target);
    const metadata = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf-8"));
    if (metadata.name !== pkgName || metadata.version !== version) {
      throw new Error(`Package metadata mismatch for ${target}.`);
    }
    const binaryPath = join(targetDir, "safe-change-native.node");
    if (!existsSync(binaryPath) || statSync(binaryPath).size === 0) {
      if (dryRun) {
        console.warn(`[DRY-RUN] Native binary unavailable for ${target}; publication was not attempted.`);
        continue;
      }
      throw new Error(`Missing or empty native binary for ${target}.`);
    }

    const tarball = createPackageTarball(targetDir, outputDir);
    if (tarball.name !== pkgName || tarball.version !== version) {
      throw new Error(`Packed metadata mismatch for ${pkgName}@${version}.`);
    }
    if (!tarball.files.includes("safe-change-native.node")) {
      throw new Error(`Native binary missing from packed tarball for ${target}.`);
    }
    console.log(`Verified ${basename(tarball.path)} sha256=${tarball.sha256}`);
    if (!dryRun) {
      publishTarball(tarball.path, version);
      if (!(await pollPackageVisibility(pkgName, version, registry))) {
        throw new Error(`${pkgName}@${version} is not visible after publication.`);
      }
    }
  }
}

export async function orchestrateRootPublish({
  rootDir = resolve("."),
  dryRun = false,
  registry = "https://registry.npmjs.org",
} = {}) {
  const rootPkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf-8"));
  const version = rootPkg.version;

  for (const target of ACTIVE_TARGETS) {
    const pkgName = `@safe-change/${target}`;
    if (!dryRun && !(await pollPackageVisibility(pkgName, version, registry, 3, 2000))) {
      throw new Error(`Native prerequisite is unavailable: ${pkgName}@${version}.`);
    }
  }

  const tarball = findRootTarball(rootDir, rootPkg.name, version);
  console.log(`Verified exact root artifact ${basename(tarball.path)} sha256=${tarball.sha256}`);
  if (dryRun) return;

  const rootStatus = await getPackageVersionStatus(rootPkg.name, version, registry);
  if (rootStatus.status === "published") {
    throw new Error(`${rootPkg.name}@${version} is already published and immutable.`);
  }
  if (rootStatus.status !== "not_published") {
    throw new Error(`Cannot determine root package publication state.`);
  }
  publishTarball(tarball.path, version);
  if (!(await pollPackageVisibility(rootPkg.name, version, registry))) {
    throw new Error(`${rootPkg.name}@${version} is not visible after publication.`);
  }
}

export async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const phaseIndex = args.indexOf("--phase");
  const phase = phaseIndex === -1 ? "all" : args[phaseIndex + 1];
  if (!new Set(["all", "native", "root"]).has(phase)) {
    throw new Error(`Invalid release phase: ${phase}`);
  }
  if (phase === "native" || phase === "all") await orchestrateNativePublish({ dryRun });
  if (phase === "root" || phase === "all") await orchestrateRootPublish({ dryRun });
}

const isDirectRun = Boolean(
  process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
);
if (isDirectRun) {
  main().catch((error) => {
    console.error(`Publication Orchestrator Error: ${error.message}`);
    process.exit(1);
  });
}
