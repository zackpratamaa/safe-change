import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { CheckDefinition, CheckResult, SafeChangeConfig } from "../types/index.js";
import type { ReplayCommandSpec, ReplayManifest, ReplayRecordedResult } from "./types.js";
import { captureWorkspaceFingerprint } from "../integrity/fingerprint.js";
import { enforcementPolicyDigest } from "../enforcement/policy-signature.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getGitState } from "../git/inspector.js";
import { stableStringify } from "../integrity/hash.js";

import { getSandboxProvider } from "../sandbox/factory.js";

const execFileAsync = promisify(execFile);

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function normalizeReplayOutput(content: string, repoRoot: string): string {
  const normalizedRoot = repoRoot.replace(/\\/g, "/");
  return content.replaceAll("\\", "/").replaceAll(normalizedRoot, "<REPO_ROOT>");
}

export async function repositoryIdentityDigest(
  repoRoot: string
): Promise<string> {
  let identity = "unknown-remote";
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["config", "--get", "remote.origin.url"],
      { cwd: repoRoot }
    );
    identity = stdout
      .trim()
      .replace(/^git@github\.com:/, "https://github.com/")
      .replace(/\.git$/, "")
      .toLowerCase();
  } catch {
    identity = "unknown-remote";
  }
  return sha256(identity);
}

export async function hashFileIfExists(path: string): Promise<string | null> {
  try {
    const data = await readFile(path);
    return sha256(data);
  } catch {
    return null;
  }
}

export async function createReplayManifest(
  repoRoot: string,
  config: SafeChangeConfig,
  sessionId: string,
  agentProfile: string,
  baselineId: string,
  checks: readonly CheckDefinition[],
  results: readonly CheckResult[]
): Promise<ReplayManifest> {
  const gitState = await getGitState(repoRoot);
  const currentHead = gitState.headCommit ?? "unknown-commit";
  const repoHash = await repositoryIdentityDigest(repoRoot);
  const fingerprint = await captureWorkspaceFingerprint(repoRoot, config);
  const policyDigest = config.enforcementPolicy
    ? enforcementPolicyDigest(config.enforcementPolicy)
    : "";

  // Collect lockfile hashes
  const lockfileHashes: Record<string, string> = {};
  const lockCandidates = [
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
  ];
  for (const cand of lockCandidates) {
    const h = await hashFileIfExists(resolve(repoRoot, cand));
    if (h) lockfileHashes[cand] = h;
  }

  // Record the running tool's package, never the inspected application's version.
  let safeChangeVersion = "unknown";
  try {
    const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")) as { version?: string };
    if (typeof pkg.version === "string" && pkg.version.length > 0) safeChangeVersion = pkg.version;
  } catch {
    // Missing tool metadata remains unknown, not a fabricated release version.
  }

  const allowedEnvKeys =
    config.enforcementPolicy?.commandSandbox.allowedEnvironment ?? [
      "NODE_ENV",
      "PATH",
    ];
  const maxOutputBytes =
    config.enforcementPolicy?.commandSandbox.maxOutputBytes ?? 100 * 1024;

  const normalizedCommands: ReplayCommandSpec[] = checks.map((c, idx) => ({
    name: c.name,
    executable: c.executable,
    args: [...c.args],
    approvedEnvKeys: [...allowedEnvKeys],
    workingDirectory: ".",
    order: idx + 1,
    timeoutSeconds: c.timeout,
    maxOutputBytes,
  }));

  const recordedResults: ReplayRecordedResult[] = results.map((r) => ({
    name: r.name,
    exitCode: r.exitCode,
    signal: null,
    stdoutDigest: sha256(normalizeReplayOutput(r.stdout, repoRoot)),
    stderrDigest: sha256(normalizeReplayOutput(r.stderr, repoRoot)),
    secretRedactionState: {
      outputBlocked: r.outputBlocked ?? false,
      detectedSecretTypes: r.detectedSecretTypes ? [...r.detectedSecretTypes] : [],
    },
    artifactHashes: {},
    durationMs: r.durationMs,
  }));

  const rawManifest = {
    schemaVersion: 1 as const,
    sessionId,
    repositoryHash: repoHash,
    startingCommit: baselineId,
    endingCommit: currentHead,
    workspaceWasClean: gitState.isClean,
    baselineId,
    policyDigest,
    workspaceFingerprint: fingerprint.digest,
    lockfileHashes,
    safeChangeVersion,
    agentProfile,
    operatingSystem: process.platform,
    architecture: process.arch,
    sandboxCapabilities: await getSandboxProvider().detectCapabilities().catch(() => null),
    runtimeVersions: {
      node: process.version,
    },
    normalizedCommands,
    recordedResults,
    createdAt: new Date().toISOString(),
  };

  const manifestDigest = sha256(stableStringify(rawManifest));

  return {
    ...rawManifest,
    manifestDigest,
  };
}
