import {
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  rmSync,
  lstatSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { isValidSemver } from "./sync-version.mjs";
import { NATIVE_TARGET_NAMES } from "./native-targets.mjs";

export const ACTIVE_TARGETS = NATIVE_TARGET_NAMES;
export const BOUND_RELEASE_DIR = "release-bound";
export const ARTIFACT_MANIFEST = "release-artifact-manifest.json";
export const ARTIFACT_MANIFEST_CHECKSUM = `${ARTIFACT_MANIFEST}.sha256`;

function encodePackageName(pkgName) {
  return encodeURIComponent(pkgName);
}

export async function getPackageVersionStatus(
  pkgName,
  version,
  registry = "https://registry.npmjs.org",
) {
  const url = `${registry.replace(/\/$/, "")}/${encodePackageName(pkgName)}/${version}`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (response.status === 404)
      return { status: "not_published", pkgName, version };
    if (response.status !== 200) {
      return {
        status: "registry_error",
        pkgName,
        version,
        code: response.status,
      };
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
  delayMs = 5000,
) {
  const url = `${registry.replace(/\/$/, "")}/${encodePackageName(pkgName)}/${version}`;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (response.status === 200) return true;
      if (response.status !== 404) return false;
    } catch {
      // Retry transient network failures until the bounded attempt limit.
    }
    if (attempt < maxAttempts) {
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, delayMs),
      );
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

    const nodeFiles = readdirSync(artifactFolder).filter((file) =>
      file.endsWith(".node"),
    );
    if (nodeFiles.length !== 1) {
      throw new Error(
        `Expected exactly one native binary for ${target}, found ${nodeFiles.length}.`,
      );
    }
    mkdirSync(targetDir, { recursive: true });
    copyFileSync(
      join(artifactFolder, nodeFiles[0]),
      join(targetDir, "safe-change-native.node"),
    );
  }
}

export function createPackageTarball(pkgDir, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const output = execFileSync(
    npmCmd,
    ["pack", "--json", "--pack-destination", outputDir],
    { cwd: pkgDir, encoding: "utf-8", shell: process.platform === "win32" },
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
    throw new Error(
      `Expected exact root tarball "${expected}", found ${matches.length}.`,
    );
  }
  const path = join(rootDir, matches[0]);
  if (statSync(path).size === 0)
    throw new Error(`Root tarball is empty: ${expected}`);
  return { path, sha256: sha256File(path) };
}

function assertRegularFile(filePath) {
  if (
    !existsSync(filePath) ||
    !lstatSync(filePath).isFile() ||
    statSync(filePath).size === 0
  ) {
    throw new Error(
      `Required regular artifact is missing or empty: ${filePath}`,
    );
  }
}

export function inspectPackageTarball(tarballPath) {
  assertRegularFile(tarballPath);
  try {
    const metadata = JSON.parse(
      execFileSync("tar", ["-xOf", tarballPath, "package/package.json"], {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      }),
    );
    const files = execFileSync("tar", ["-tzf", tarballPath], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    })
      .split(/\r?\n/)
      .filter(Boolean);
    return { metadata, files };
  } catch (error) {
    throw new Error(
      `Cannot inspect package tarball ${basename(tarballPath)}: ${error.message}`,
    );
  }
}

function artifactRecord(filePath, fields) {
  assertRegularFile(filePath);
  return {
    ...fields,
    file: basename(filePath),
    size: statSync(filePath).size,
    sha256: sha256File(filePath),
  };
}

function copyRequiredFile(source, destination) {
  assertRegularFile(source);
  copyFileSync(source, destination);
  assertRegularFile(destination);
}

function validateEvidenceChecksum(boundDir) {
  const checksum = readFileSync(
    join(boundDir, "release-evidence.tar.gz.sha256"),
    "utf8",
  ).trim();
  const match = /^([a-f0-9]{64})  release-evidence\.tar\.gz$/.exec(checksum);
  if (
    !match ||
    match[1] !== sha256File(join(boundDir, "release-evidence.tar.gz"))
  ) {
    throw new Error("Release evidence checksum is invalid.");
  }
}

export function validateBoundReleaseArtifacts({
  rootDir = resolve("."),
  sourceSha = process.env.GITHUB_SHA,
  runId = process.env.GITHUB_RUN_ID,
} = {}) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? "") || !/^\d+$/.test(runId ?? "")) {
    throw new Error("Missing or invalid bound-artifact provenance.");
  }
  const boundDir = join(rootDir, BOUND_RELEASE_DIR);
  const manifestPath = join(boundDir, ARTIFACT_MANIFEST);
  const checksumPath = join(boundDir, ARTIFACT_MANIFEST_CHECKSUM);
  assertRegularFile(manifestPath);
  assertRegularFile(checksumPath);
  const checksum = readFileSync(checksumPath, "utf8").trim();
  const checksumMatch = new RegExp(
    `^([a-f0-9]{64})  ${ARTIFACT_MANIFEST}$`,
  ).exec(checksum);
  if (!checksumMatch || checksumMatch[1] !== sha256File(manifestPath)) {
    throw new Error("Release artifact manifest checksum is invalid.");
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const rootPkg = JSON.parse(
    readFileSync(join(rootDir, "package.json"), "utf8"),
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.sourceSha !== sourceSha ||
    manifest.runId !== runId ||
    manifest.packageVersion !== rootPkg.version ||
    !Array.isArray(manifest.artifacts)
  ) {
    throw new Error("Release artifact manifest provenance or schema mismatch.");
  }

  const expectedKinds = [
    "root-package",
    ...ACTIVE_TARGETS.map((target) => `native-package:${target}`),
    "sbom",
    "release-evidence",
    "release-evidence-checksum",
  ];
  const actualKinds = manifest.artifacts.map((artifact) =>
    artifact.kind === "native-package"
      ? `${artifact.kind}:${artifact.target}`
      : artifact.kind,
  );
  if (actualKinds.join() !== expectedKinds.join()) {
    throw new Error(
      "Release artifact manifest has an unexpected or incomplete artifact set.",
    );
  }

  const seenFiles = new Set();
  for (const artifact of manifest.artifacts) {
    if (
      typeof artifact.file !== "string" ||
      basename(artifact.file) !== artifact.file ||
      seenFiles.has(artifact.file) ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
      !Number.isSafeInteger(artifact.size) ||
      artifact.size <= 0
    ) {
      throw new Error("Release artifact record is malformed.");
    }
    seenFiles.add(artifact.file);
    const artifactPath = join(boundDir, artifact.file);
    assertRegularFile(artifactPath);
    if (
      statSync(artifactPath).size !== artifact.size ||
      sha256File(artifactPath) !== artifact.sha256
    ) {
      throw new Error(`Bound release artifact mismatch: ${artifact.file}`);
    }
  }

  for (const artifact of manifest.artifacts.filter((entry) =>
    ["root-package", "native-package"].includes(entry.kind),
  )) {
    const { metadata, files } = inspectPackageTarball(
      join(boundDir, artifact.file),
    );
    const expectedName =
      artifact.kind === "root-package"
        ? rootPkg.name
        : `@safe-change/${artifact.target}`;
    if (
      artifact.packageName !== expectedName ||
      artifact.version !== rootPkg.version ||
      metadata.name !== expectedName ||
      metadata.version !== rootPkg.version
    ) {
      throw new Error(`Bound package metadata mismatch: ${artifact.file}`);
    }
    if (
      artifact.kind === "native-package" &&
      !files.includes("package/safe-change-native.node")
    ) {
      throw new Error(
        `Bound native package is missing its binary: ${artifact.file}`,
      );
    }
    if (artifact.kind === "root-package") {
      for (const target of ACTIVE_TARGETS) {
        if (
          metadata.optionalDependencies?.[`@safe-change/${target}`] !==
          rootPkg.version
        ) {
          throw new Error(
            `Bound root package is missing native dependency ${target}.`,
          );
        }
      }
    }
  }
  validateEvidenceChecksum(boundDir);
  return manifest;
}

export function prepareBoundReleaseArtifacts({
  rootDir = resolve("."),
  sourceSha = process.env.GITHUB_SHA,
  runId = process.env.GITHUB_RUN_ID,
} = {}) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? "") || !/^\d+$/.test(runId ?? "")) {
    throw new Error("Missing or invalid bound-artifact provenance.");
  }
  const rootPkg = JSON.parse(
    readFileSync(join(rootDir, "package.json"), "utf8"),
  );
  if (!isValidSemver(rootPkg.version))
    throw new Error("Invalid root package version.");
  const boundDir = join(rootDir, BOUND_RELEASE_DIR);
  rmSync(boundDir, { recursive: true, force: true });
  mkdirSync(boundDir, { recursive: true });

  copyNativeArtifacts(rootDir);
  const artifacts = [];
  const rootArtifactsDir = join(rootDir, "root-artifacts");
  const rootTarball = findRootTarball(
    rootArtifactsDir,
    rootPkg.name,
    rootPkg.version,
  );
  const boundRootTarball = join(boundDir, basename(rootTarball.path));
  copyRequiredFile(rootTarball.path, boundRootTarball);
  const rootMetadata = inspectPackageTarball(boundRootTarball).metadata;
  if (
    rootMetadata.name !== rootPkg.name ||
    rootMetadata.version !== rootPkg.version
  ) {
    throw new Error(
      "Root tarball metadata does not match the release package.",
    );
  }
  artifacts.push(
    artifactRecord(boundRootTarball, {
      kind: "root-package",
      packageName: rootPkg.name,
      version: rootPkg.version,
      target: null,
    }),
  );

  for (const target of ACTIVE_TARGETS) {
    const targetDir = join(rootDir, "npm", target);
    assertRegularFile(join(targetDir, "safe-change-native.node"));
    const tarball = createPackageTarball(targetDir, boundDir);
    if (
      tarball.name !== `@safe-change/${target}` ||
      tarball.version !== rootPkg.version ||
      !tarball.files.includes("safe-change-native.node")
    ) {
      throw new Error(`Native tarball metadata mismatch for ${target}.`);
    }
    artifacts.push(
      artifactRecord(tarball.path, {
        kind: "native-package",
        packageName: tarball.name,
        version: tarball.version,
        target,
      }),
    );
  }

  for (const [file, kind] of [
    ["safe-change-sbom.cdx.json", "sbom"],
    ["release-evidence.tar.gz", "release-evidence"],
    ["release-evidence.tar.gz.sha256", "release-evidence-checksum"],
  ]) {
    const destination = join(boundDir, file);
    copyRequiredFile(join(rootArtifactsDir, file), destination);
    artifacts.push(artifactRecord(destination, { kind }));
  }
  validateEvidenceChecksum(boundDir);

  const manifest = {
    schemaVersion: 1,
    sourceSha,
    runId,
    packageVersion: rootPkg.version,
    artifacts,
  };
  const manifestPath = join(boundDir, ARTIFACT_MANIFEST);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(
    join(boundDir, ARTIFACT_MANIFEST_CHECKSUM),
    `${sha256File(manifestPath)}  ${ARTIFACT_MANIFEST}\n`,
    "utf8",
  );
  validateBoundReleaseArtifacts({ rootDir, sourceSha, runId });
  return manifest;
}

export async function determineReleaseMode(
  version,
  registry = "https://registry.npmjs.org",
) {
  const root = await getPackageVersionStatus("safe-change", version, registry);
  const native = [];
  for (const target of ACTIVE_TARGETS) {
    native.push(
      await getPackageVersionStatus(
        `@safe-change/${target}`,
        version,
        registry,
      ),
    );
  }
  const failures = [root, ...native].filter((item) =>
    ["registry_error", "network_error"].includes(item.status),
  );
  if (failures.length > 0) {
    throw new Error(
      `Registry state could not be determined for ${failures.map((x) => x.pkgName).join(", ")}.`,
    );
  }
  const nativePublished = native.filter(
    (item) => item.status === "published",
  ).length;
  if (root.status === "not_published" && nativePublished === 0) return "full";
  if (root.status === "not_published" && nativePublished === native.length)
    return "root-recovery";
  if (root.status === "published" && nativePublished === native.length)
    return "complete";
  throw new Error(
    `Unsafe mixed release state: root=${root.status}, native published=${nativePublished}/${native.length}.`,
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
  const rootPkg = JSON.parse(
    readFileSync(join(rootDir, "package.json"), "utf8"),
  );
  const version = rootPkg.version;
  const manifest = validateBoundReleaseArtifacts({ rootDir });
  for (const target of ACTIVE_TARGETS) {
    const pkgName = `@safe-change/${target}`;
    const status = await getPackageVersionStatus(pkgName, version, registry);
    if (status.status === "published") {
      console.log(
        `Skipping immutable package already on registry: ${pkgName}@${version}`,
      );
      continue;
    }
    if (status.status !== "not_published") {
      throw new Error(
        `Cannot determine publication state for ${pkgName}@${version}.`,
      );
    }
    const artifact = manifest.artifacts.find(
      (entry) => entry.kind === "native-package" && entry.target === target,
    );
    if (!artifact)
      throw new Error(`Bound native artifact missing for ${target}.`);
    const tarballPath = join(rootDir, BOUND_RELEASE_DIR, artifact.file);
    console.log(`Verified ${artifact.file} sha256=${artifact.sha256}`);
    if (!dryRun) {
      publishTarball(tarballPath, version);
      if (!(await pollPackageVisibility(pkgName, version, registry))) {
        throw new Error(
          `${pkgName}@${version} is not visible after publication.`,
        );
      }
    }
  }
}

export async function orchestrateRootPublish({
  rootDir = resolve("."),
  dryRun = false,
  registry = "https://registry.npmjs.org",
} = {}) {
  const rootPkg = JSON.parse(
    readFileSync(join(rootDir, "package.json"), "utf8"),
  );
  const version = rootPkg.version;
  const manifest = validateBoundReleaseArtifacts({ rootDir });
  for (const target of ACTIVE_TARGETS) {
    const pkgName = `@safe-change/${target}`;
    if (
      !dryRun &&
      !(await pollPackageVisibility(pkgName, version, registry, 3, 2000))
    ) {
      throw new Error(
        `Native prerequisite is unavailable: ${pkgName}@${version}.`,
      );
    }
  }
  const rootArtifact = manifest.artifacts.find(
    (entry) => entry.kind === "root-package",
  );
  if (!rootArtifact) throw new Error("Bound root artifact is missing.");
  const tarballPath = join(rootDir, BOUND_RELEASE_DIR, rootArtifact.file);
  console.log(
    `Verified exact root artifact ${rootArtifact.file} sha256=${rootArtifact.sha256}`,
  );
  if (dryRun) return;
  const rootStatus = await getPackageVersionStatus(
    rootPkg.name,
    version,
    registry,
  );
  if (rootStatus.status === "published") {
    throw new Error(
      `${rootPkg.name}@${version} is already published and immutable.`,
    );
  }
  if (rootStatus.status !== "not_published") {
    throw new Error("Cannot determine root package publication state.");
  }
  publishTarball(tarballPath, version);
  if (!(await pollPackageVisibility(rootPkg.name, version, registry))) {
    throw new Error(
      `${rootPkg.name}@${version} is not visible after publication.`,
    );
  }
}

export async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const phaseIndex = args.indexOf("--phase");
  const phase = phaseIndex === -1 ? "all" : args[phaseIndex + 1];
  if (!new Set(["all", "prepare", "native", "root"]).has(phase)) {
    throw new Error(`Invalid release phase: ${phase}`);
  }
  if (phase === "prepare") prepareBoundReleaseArtifacts();
  if (phase === "native" || phase === "all")
    await orchestrateNativePublish({ dryRun });
  if (phase === "root" || phase === "all")
    await orchestrateRootPublish({ dryRun });
}

const isDirectRun = Boolean(
  process.argv[1] &&
  resolve(process.argv[1]).toLowerCase() ===
    fileURLToPath(import.meta.url).toLowerCase(),
);
if (isDirectRun) {
  main().catch((error) => {
    console.error(`Publication Orchestrator Error: ${error.message}`);
    process.exit(1);
  });
}
