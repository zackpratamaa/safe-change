import { createHash } from "node:crypto";
import { join } from "node:path";
import type {
  Baseline,
  CheckResult,
  FileEntry,
  FileStatus,
  GitState,
  SafeChangeConfig,
  SecretType,
  WorkspaceFingerprint,
} from "../types/index.js";
import { captureWorkspaceFingerprint } from "../integrity/fingerprint.js";
import { readStateFile, writeStateFileAtomically } from "../security/state-files.js";
import { hasTrackedState, isStateIgnored } from "../git/state-ignore.js";

const STATE_DIR = ".safe-change";
const BASELINE_FILE = "baseline.json";
const CURRENT_SCHEMA_VERSION = 2;

const VALID_FILE_STATUSES = new Set<string>([
  "clean",
  "modified",
  "staged",
  "untracked",
  "deleted",
]);

export class BaselineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaselineError";
  }
}

/**
 * Compute a stable hash of the check configuration for drift detection.
 */
export function computeConfigHash(config: SafeChangeConfig): string {
  const normalized = config.checks.map((c) => ({
    name: c.name,
    executable: c.executable,
    args: [...c.args],
    timeout: c.timeout,
  }));
  const serialized = JSON.stringify(normalized);
  return "sha256:" + createHash("sha256").update(serialized).digest("hex");
}

/**
 * Save a baseline atomically. Writes to a temp file then renames.
 */
export async function saveBaseline(
  repoRoot: string,
  description: string,
  git: GitState,
  files: Record<string, FileEntry>,
  checks: readonly CheckResult[],
  config: SafeChangeConfig
): Promise<string> {
  const workspaceFingerprint = await captureWorkspaceFingerprint(
    repoRoot,
    config
  );

  const baseline: Baseline = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    description,
    git,
    files,
    excludedPaths: [".safe-change/"],
    checks: [...checks],
    checksConfigHash: computeConfigHash(config),
    workspaceFingerprint,
  };

  const content = JSON.stringify(baseline, null, 2) + "\n";
  let baselinePath: string;
  try {
    baselinePath = await writeStateFileAtomically(repoRoot, BASELINE_FILE, content);
  } catch (err: unknown) {
    throw new BaselineError(
      `Failed to write baseline: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return baselinePath;
}

/**
 * Load the baseline from the state directory. Returns null if no baseline
 * exists. Throws BaselineError if the file exists but is corrupt or
 * uses an unsupported schema version.
 */
export async function loadBaseline(
  repoRoot: string
): Promise<Baseline | null> {
  const baselinePath = join(repoRoot, STATE_DIR, BASELINE_FILE);

  let raw: string;
  try {
    const stored = await readStateFile(repoRoot, BASELINE_FILE);
    if (stored === null) return null;
    raw = stored;
  } catch (err: unknown) {
    throw new BaselineError(
      `Failed to read baseline: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BaselineError(
      `Baseline file is corrupt (invalid JSON): ${baselinePath}\n` +
      `Delete the file and run "safe-change save" to create a new baseline.`
    );
  }

  return validateBaseline(parsed, baselinePath);
}

/** Confirm effective Git exclusion and absence of already tracked state. */
export async function isStateExcludedFromGit(repoRoot: string): Promise<boolean> {
  try {
    return !(await hasTrackedState(repoRoot)) && await isStateIgnored(repoRoot);
  } catch {
    return false;
  }
}

/**
 * Return the path to the state directory.
 */
export function getStateDirPath(repoRoot: string): string {
  return join(repoRoot, STATE_DIR);
}

// Validation

function validateBaseline(data: unknown, filePath: string): Baseline {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new BaselineError(
      `Baseline file is corrupt (not an object): ${filePath}`
    );
  }

  const obj = data as Record<string, unknown>;

  if (obj["schemaVersion"] !== CURRENT_SCHEMA_VERSION) {
    throw new BaselineError(
      `Unsupported baseline schema version: ${String(obj["schemaVersion"])}.\n` +
      `This version of safe-change expects schema version ${CURRENT_SCHEMA_VERSION}.\n` +
      `Delete the baseline and run "safe-change save" to create a new one.`
    );
  }

  if (typeof obj["createdAt"] !== "string") {
    throw new BaselineError("Baseline missing createdAt timestamp.");
  }

  if (typeof obj["description"] !== "string") {
    throw new BaselineError("Baseline missing description.");
  }

  if (typeof obj["git"] !== "object" || obj["git"] === null) {
    throw new BaselineError("Baseline missing git state.");
  }

  const rawGit = obj["git"] as Record<string, unknown>;
  if (typeof rawGit["repositoryRoot"] !== "string") {
    throw new BaselineError("Baseline missing git repositoryRoot.");
  }
  if (rawGit["headCommit"] !== null && typeof rawGit["headCommit"] !== "string") {
    throw new BaselineError("Baseline invalid git headCommit.");
  }
  if (rawGit["headBranch"] !== null && typeof rawGit["headBranch"] !== "string") {
    throw new BaselineError("Baseline invalid git headBranch.");
  }
  if (typeof rawGit["isClean"] !== "boolean") {
    throw new BaselineError("Baseline invalid git isClean.");
  }

  const gitState: GitState = {
    repositoryRoot: rawGit["repositoryRoot"] as string,
    headCommit: rawGit["headCommit"] as string | null,
    headBranch: rawGit["headBranch"] as string | null,
    isClean: rawGit["isClean"] as boolean,
  };

  if (typeof obj["files"] !== "object" || obj["files"] === null || Array.isArray(obj["files"])) {
    throw new BaselineError("Baseline missing file entries.");
  }

  // Deeply validate file entries and construct null-prototype dictionary
  // to prevent prototype pollution from files named '__proto__'
  const rawFiles = obj["files"] as Record<string, unknown>;
  const safeFiles: Record<string, FileEntry> = Object.create(null);

  for (const filePath of Object.keys(rawFiles)) {
    const rawEntry = rawFiles[filePath];
    if (typeof rawEntry !== "object" || rawEntry === null) {
      throw new BaselineError(`Baseline file entry "${filePath}" is corrupt.`);
    }

    const fe = rawEntry as Record<string, unknown>;
    if (typeof fe["tracked"] !== "boolean") {
      throw new BaselineError(`Baseline file entry "${filePath}" has invalid tracked flag.`);
    }
    if (typeof fe["status"] !== "string" || !VALID_FILE_STATUSES.has(fe["status"])) {
      throw new BaselineError(`Baseline file entry "${filePath}" has invalid status.`);
    }
    if (fe["worktreeHash"] !== null && typeof fe["worktreeHash"] !== "string") {
      throw new BaselineError(`Baseline file entry "${filePath}" has invalid worktreeHash.`);
    }
    if (fe["indexHash"] !== null && typeof fe["indexHash"] !== "string") {
      throw new BaselineError(`Baseline file entry "${filePath}" has invalid indexHash.`);
    }

    safeFiles[filePath] = {
      tracked: fe["tracked"] as boolean,
      status: fe["status"] as FileStatus,
      worktreeHash: fe["worktreeHash"] as string | null,
      indexHash: fe["indexHash"] as string | null,
    };
  }

  if (!Array.isArray(obj["checks"])) {
    throw new BaselineError("Baseline missing check results.");
  }

  // Deeply validate checks
  const safeChecks: CheckResult[] = [];
  for (const rawCheck of obj["checks"]) {
    if (typeof rawCheck !== "object" || rawCheck === null) {
      throw new BaselineError("Baseline contains an invalid check result.");
    }
    const c = rawCheck as Record<string, unknown>;
    if (typeof c["name"] !== "string" || typeof c["executable"] !== "string") {
      throw new BaselineError("Baseline check result missing name or executable.");
    }
    if (!Array.isArray(c["args"])) {
      throw new BaselineError(`Baseline check "${c["name"]}" has invalid args.`);
    }
    if (c["exitCode"] !== null && typeof c["exitCode"] !== "number") {
      throw new BaselineError(`Baseline check "${c["name"]}" has invalid exitCode.`);
    }
    if (typeof c["passed"] !== "boolean") {
      throw new BaselineError(`Baseline check "${c["name"]}" has invalid passed flag.`);
    }
    if (typeof c["timedOut"] !== "boolean") {
      throw new BaselineError(`Baseline check "${c["name"]}" has invalid timedOut flag.`);
    }

    safeChecks.push({
      name: c["name"] as string,
      executable: c["executable"] as string,
      args: (c["args"] as unknown[]).map(String),
      timeout: typeof c["timeout"] === "number" ? (c["timeout"] as number) : 60,
      exitCode: c["exitCode"] as number | null,
      passed: c["passed"] as boolean,
      durationMs: typeof c["durationMs"] === "number" ? (c["durationMs"] as number) : 0,
      timedOut: c["timedOut"] as boolean,
      outputBytes: typeof c["outputBytes"] === "number" ? (c["outputBytes"] as number) : 0,
      outputTruncated: Boolean(c["outputTruncated"]),
      stdout: typeof c["stdout"] === "string" ? (c["stdout"] as string) : "",
      stderr: typeof c["stderr"] === "string" ? (c["stderr"] as string) : "",
      outputBlocked: Boolean(c["outputBlocked"]),
      detectedSecretTypes: Array.isArray(c["detectedSecretTypes"])
        ? (c["detectedSecretTypes"].map(String) as SecretType[])
        : [],
    });
  }

  if (typeof obj["checksConfigHash"] !== "string") {
    throw new BaselineError("Baseline missing checksConfigHash.");
  }

  let workspaceFingerprint: WorkspaceFingerprint | undefined;
  if (obj["workspaceFingerprint"] !== undefined) {
    const fingerprint = obj["workspaceFingerprint"];
    if (
      typeof fingerprint !== "object" ||
      fingerprint === null ||
      Array.isArray(fingerprint) ||
      typeof (fingerprint as Record<string, unknown>)["digest"] !== "string"
    ) {
      throw new BaselineError("Baseline has invalid workspaceFingerprint.");
    }
    workspaceFingerprint = fingerprint as WorkspaceFingerprint;
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: obj["createdAt"] as string,
    description: obj["description"] as string,
    git: gitState,
    files: safeFiles,
    excludedPaths: [".safe-change/"],
    checks: safeChecks,
    checksConfigHash: obj["checksConfigHash"] as string,
    ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
  };
}

