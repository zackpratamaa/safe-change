import type { OutputFormat, LogCheckResult } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { loadConfig } from "../config/loader.js";
import {
  getRepositoryRoot,
  getGitState,
  getFileEntries,
} from "../git/inspector.js";
import {
  saveBaseline,
  isStateExcludedFromGit,
} from "../baseline/manager.js";
import { executeAllChecks } from "../runner/executor.js";
import { renderSaveResult, renderError } from "../output/renderer.js";
import { appendEntry, createLogEntry } from "../log/log-manager.js";
import { captureWorkspaceFingerprint } from "../integrity/fingerprint.js";
import { sourceDigest } from "../integrity/verification-binding.js";
import { loadRulesResult } from "../rules/manager.js";

export interface SaveOptions {
  readonly description: string;
  readonly format: OutputFormat;
  readonly trigger?: "manual" | "mcp" | "cli";
}

export async function runSave(options: SaveOptions): Promise<number> {
  const { description, format } = options;

  // 1. Verify Git repository
  let repoRoot: string;
  try {
    repoRoot = await getRepositoryRoot(process.cwd());
  } catch {
    process.stderr.write(
      renderError(format, "Not a Git repository. safe-change requires a Git repository.", ExitCodes.NOT_GIT_REPO)
    );
    return ExitCodes.NOT_GIT_REPO;
  }

  // 2. Load configuration
  let config;
  try {
    config = await loadConfig(repoRoot);
  } catch (err: unknown) {
    process.stderr.write(
      renderError(
        format,
        err instanceof Error ? err.message : String(err),
        ExitCodes.CONFIG_ERROR
      )
    );
    return ExitCodes.CONFIG_ERROR;
  }

  // 3. Load and validate safety rules (fail-closed)
  let rulesState;
  try {
    rulesState = await loadRulesResult(repoRoot);
  } catch (err: unknown) {
    rulesState = {
      status: "invalid" as const,
      rules: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (rulesState.status === "invalid") {
    process.stderr.write(
      renderError(
        format,
        `Invalid safety rules configuration: ${rulesState.error ?? "Failed to parse rules.json"}`,
        ExitCodes.CONFIG_ERROR
      )
    );
    return ExitCodes.CONFIG_ERROR;
  }

  if (rulesState.status === "evaluation-error") {
    process.stderr.write(
      renderError(
        format,
        `Safety rules evaluation error: ${rulesState.error ?? "Internal rules error"}`,
        ExitCodes.INTERNAL_ERROR
      )
    );
    return ExitCodes.INTERNAL_ERROR;
  }

  // 4. Inspect Git state and files
  let gitState;
  let files;
  try {
    [gitState, files] = await Promise.all([
      getGitState(repoRoot),
      getFileEntries(repoRoot),
    ]);
  } catch (err: unknown) {
    process.stderr.write(
      renderError(
        format,
        `Failed to read repository state: ${err instanceof Error ? err.message : String(err)}`,
        ExitCodes.INTERNAL_ERROR
      )
    );
    return ExitCodes.INTERNAL_ERROR;
  }

  let beforeFingerprint;
  try {
    beforeFingerprint = await captureWorkspaceFingerprint(repoRoot, config);
  } catch (error: unknown) {
    process.stderr.write(renderError(format, `Baseline fingerprint failed: ${String(error)}`, ExitCodes.INTERNAL_ERROR));
    return ExitCodes.INTERNAL_ERROR;
  }
  const beforeSourceDigest = sourceDigest(files);

  // 4. Execute verification checks
  let checkResults;
  try {
    checkResults = await executeAllChecks(config.checks, {
      cwd: repoRoot,
      sandboxPolicy: config.enforcementPolicy?.commandSandbox,
    }, (name, index, total) => {
      if (format === "terminal") {
        process.stderr.write(`  Running check ${index + 1}/${total}: ${name}\r`);
      }
    });
  } catch (err: unknown) {
    process.stderr.write(
      renderError(
        format,
        `Failed to execute checks: ${err instanceof Error ? err.message : String(err)}`,
        ExitCodes.INTERNAL_ERROR
      )
    );
    return ExitCodes.INTERNAL_ERROR;
  }

  try {
    const finalFiles = await getFileEntries(repoRoot);
    const finalFingerprint = await captureWorkspaceFingerprint(repoRoot, config);
    if (beforeSourceDigest !== sourceDigest(finalFiles) || beforeFingerprint.digest !== finalFingerprint.digest) {
      process.stderr.write(renderError(format, "Verification inputs changed during baseline checks; baseline was not saved.", ExitCodes.NEW_FAILURE));
      return ExitCodes.NEW_FAILURE;
    }
  } catch (error: unknown) {
    process.stderr.write(renderError(format, `Post-baseline inspection failed: ${String(error)}`, ExitCodes.INTERNAL_ERROR));
    return ExitCodes.INTERNAL_ERROR;
  }

  // 5. Save baseline
  let baselinePath: string;
  try {
    baselinePath = await saveBaseline(
      repoRoot,
      description,
      gitState,
      files,
      checkResults,
      config
    );
  } catch (err: unknown) {
    process.stderr.write(
      renderError(
        format,
        `Failed to save baseline: ${err instanceof Error ? err.message : String(err)}`,
        ExitCodes.INTERNAL_ERROR
      )
    );
    return ExitCodes.INTERNAL_ERROR;
  }

  // 6. Append to safety log
  try {
    const logCheckResults: LogCheckResult[] = checkResults.map((c) => ({
      name: c.name,
      result: c.passed ? "pass-pass" : "fail-fail",
      before: c.passed ? "pass" : "fail",
      now: c.passed ? "pass" : "fail",
    }));
    const totalDurationMs = checkResults.reduce(
      (sum, r) => sum + (r.durationMs || 0),
      0
    );
    const entry = createLogEntry({
      description: description || null,
      baselineId: gitState.headCommit ?? baselinePath,
      trigger: options.trigger ?? "cli",
      checkResults: logCheckResults,
      fileSummary: {
        added: 0,
        modified: 0,
        deleted: 0,
        unchanged: Object.keys(files).length,
      },
      regressionDetected: false,
      durationMs: totalDurationMs,
    });
    await appendEntry(entry, repoRoot, config.logRetention);
  } catch {
    // Safety log write failure should not abort baseline save
  }

  // 7. Check .gitignore warning
  const gitignoreOk = await isStateExcludedFromGit(repoRoot);

  // 8. Compute verification status
  const checksRun = checkResults.length;
  const checksPassed = checkResults.filter((r) => r.passed).length;
  const fileCount = Object.keys(files).length;
  const configuredChecksCount = config.checks.length;
  const activeRulesCount = rulesState.rules.length;

  let verificationState: "verified" | "failed" | "not-verified";
  let verificationReason: string;

  if (configuredChecksCount === 0 && activeRulesCount === 0) {
    verificationState = "not-verified";
    verificationReason = "Zero checks and zero rules configured; file changes tracked only";
  } else if (configuredChecksCount === 0) {
    verificationState = "not-verified";
    verificationReason = "No verification checks configured; file changes and rules only";
  } else if (checksPassed < checksRun) {
    verificationState = "not-verified";
    verificationReason = `${checksRun - checksPassed} baseline check(s) currently failing`;
  } else {
    verificationState = "verified";
    verificationReason = "All configured baseline checks passed";
  }

  // 9. Render output
  process.stdout.write(
    renderSaveResult(
      format,
      description,
      checksRun,
      checksPassed,
      fileCount,
      baselinePath,
      !gitignoreOk,
      {
        state: verificationState,
        reason: verificationReason,
        configuredChecksCount,
        executedChecksCount: checksRun,
        activeRulesCount,
      }
    )
  );

  return ExitCodes.OK;
}
