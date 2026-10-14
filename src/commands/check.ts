import type { OutputFormat, LogCheckResult, CheckLogState } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { loadConfig } from "../config/loader.js";
import {
  getRepositoryRoot,
  getFileEntries,
  getGitState,
} from "../git/inspector.js";
import { loadBaseline } from "../baseline/manager.js";
import { executeAllChecks } from "../runner/executor.js";
import { buildReport } from "../comparator/engine.js";
import { renderCheckReport, renderError } from "../output/renderer.js";
import { updateLastEntry } from "../log/log-manager.js";
import { loadRulesResult } from "../rules/manager.js";
import { evaluateRules } from "../rules/engine.js";
import {
  captureWorkspaceFingerprint,
  compareWorkspaceFingerprints,
} from "../integrity/fingerprint.js";
import { captureVerificationBinding, bindingsMatch, changedVerificationInputs } from "../integrity/verification-binding.js";
import { persistVerificationSummary } from "../integrity/evidence.js";

export interface CheckOptions {
  readonly format: OutputFormat;
  readonly strict?: boolean;
  readonly trigger?: "manual" | "mcp" | "cli";
}

export async function runCheck(options: CheckOptions): Promise<number> {
  const { format } = options;

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

  // 2. Load baseline
  let baseline;
  try {
    baseline = await loadBaseline(repoRoot);
  } catch (err: unknown) {
    process.stderr.write(
      renderError(
        format,
        err instanceof Error ? err.message : String(err),
        ExitCodes.NO_BASELINE
      )
    );
    return ExitCodes.NO_BASELINE;
  }

  if (baseline === null) {
    process.stderr.write(
      renderError(
        format,
        'No baseline found. Run "safe-change save" first to create a baseline.',
        ExitCodes.NO_BASELINE
      )
    );
    return ExitCodes.NO_BASELINE;
  }

  // 3. Load current configuration
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

  // 4. Get current file state
  let currentFiles;
  try {
    currentFiles = await getFileEntries(repoRoot);
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

  let beforeBinding;
  try {
    beforeBinding = await captureVerificationBinding(repoRoot, config, baseline, currentFiles);
  } catch (error: unknown) {
    process.stderr.write(renderError(format, `Verification binding failed: ${String(error)}`, ExitCodes.INTERNAL_ERROR));
    return ExitCodes.INTERNAL_ERROR;
  }

  // 5. Execute current checks
  let currentResults;
  try {
    currentResults = await executeAllChecks(config.checks, {
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

  // Read the final state as well: checks are allowed to execute, not to silently
  // replace the inputs on which their verification result depends.
  let afterBinding;
  try {
    currentFiles = await getFileEntries(repoRoot);
    const currentBaseline = await loadBaseline(repoRoot);
    if (!currentBaseline) throw new Error("Baseline disappeared during verification.");
    afterBinding = await captureVerificationBinding(repoRoot, config, currentBaseline, currentFiles);
  } catch (error: unknown) {
    process.stderr.write(renderError(format, `Post-check inspection failed: ${String(error)}`, ExitCodes.INTERNAL_ERROR));
    return ExitCodes.INTERNAL_ERROR;
  }
  const inputMutationDetected = !bindingsMatch(beforeBinding, afterBinding);
  const verificationInputDrift = changedVerificationInputs(repoRoot, baseline, currentFiles, config);

  // 6. Build and render report using the final file snapshot.
  let report = buildReport(baseline, currentResults, currentFiles, config);

  // Check branch mismatch
  try {
    const gitState = await getGitState(repoRoot);
    if (
      baseline.git.headBranch &&
      gitState.headBranch &&
      baseline.git.headBranch !== gitState.headBranch
    ) {
      report = {
        ...report,
        branchMismatch: {
          baselineBranch: baseline.git.headBranch,
          currentBranch: gitState.headBranch,
        },
      };
    }
  } catch {
    // Git inspection error should not prevent check report
  }

  if (baseline.workspaceFingerprint) {
    try {
      const currentFingerprint = await captureWorkspaceFingerprint(
        repoRoot,
        config
      );
      report = {
        ...report,
        workspaceDrift: compareWorkspaceFingerprints(
          baseline.workspaceFingerprint,
          currentFingerprint
        ),
      };
    } catch (error: unknown) {
      process.stderr.write(
        renderError(
          format,
          `Workspace fingerprint failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          ExitCodes.INTERNAL_ERROR
        )
      );
      return ExitCodes.INTERNAL_ERROR;
    }
  }

  // Evaluate safety rules (fail-closed)
  const rulesState = await loadRulesResult(repoRoot);
  if (rulesState.status === "invalid") {
    process.stderr.write(
      renderError(
        format,
        `Invalid safety rules configuration: ${rulesState.error}`,
        ExitCodes.CONFIG_ERROR
      )
    );
    return ExitCodes.CONFIG_ERROR;
  }

  if (rulesState.status === "loaded" && rulesState.rules.length > 0) {
    try {
      const ruleEvaluation = evaluateRules(rulesState.rules, report.files, report.results);
      if (ruleEvaluation.violations.length > 0) {
        const exitCode =
          ruleEvaluation.errorCount > 0 ? ExitCodes.NEW_FAILURE : report.exitCode;
        report = {
          ...report,
          exitCode,
          ruleViolations: ruleEvaluation.violations,
        };
      }
    } catch (err: unknown) {
      process.stderr.write(
        renderError(
          format,
          `Safety rules evaluation error: ${err instanceof Error ? err.message : String(err)}`,
          ExitCodes.INTERNAL_ERROR
        )
      );
      return ExitCodes.INTERNAL_ERROR;
    }
  }

  // Verification state computation
  const activeRulesCount = rulesState.rules.length;
  const configuredChecksCount = config.checks.length;
  const executedChecksCount = report.results.length;

  let verificationState: "verified" | "failed" | "not-verified";
  let verificationReason: string;

  const hasNewFailures = report.summary.newFailures > 0;
  const hasBlockingRuleViolations = (report.ruleViolations ?? []).some(
    (v) => v.severity === "error"
  );
  const hasStillFailing = report.summary.stillFailing > 0;
  const hasCurrentFailures = report.results.some(
    (r) => r.now === "fail" || r.now === "timeout"
  );

  if (hasNewFailures || hasBlockingRuleViolations) {
    verificationState = "failed";
    verificationReason = hasBlockingRuleViolations
      ? "Safety rule violation detected"
      : "Regression detected in check results";
  } else if (hasStillFailing || hasCurrentFailures) {
    verificationState = "failed";
    verificationReason =
      "Pre-existing check failure remains unresolved from baseline";
  } else if (inputMutationDetected) {
    verificationState = "not-verified";
    verificationReason = "Verification inputs changed during check execution; rerun on stable inputs";
  } else if (verificationInputDrift.length > 0) {
    verificationState = "not-verified";
    verificationReason = "Protected verification inputs changed since baseline; review and explicitly save an accepted baseline";
  } else if (configuredChecksCount === 0 && activeRulesCount === 0) {
    verificationState = "not-verified";
    verificationReason =
      "Zero checks and zero rules configured; file changes tracked only";
  } else if (configuredChecksCount === 0) {
    verificationState = "not-verified";
    verificationReason =
      "No verification checks configured; file changes and rules only";
  } else if (
    executedChecksCount > 0 &&
    report.summary.definitionChanged === executedChecksCount
  ) {
    verificationState = "not-verified";
    verificationReason =
      "All check definitions changed since baseline; results not comparable";
  } else if (report.configDrift.detected) {
    verificationState = "not-verified";
    verificationReason =
      "Verification configuration changed since baseline; results are not fully comparable";
  } else if (report.workspaceDrift?.detected) {
    verificationState = "not-verified";
    verificationReason = `Workspace fingerprint drift detected: ${report.workspaceDrift.categories.join(
      ", "
    )}`;
  } else {
    verificationState = "verified";
    verificationReason = "All verification checks passed without regressions";
  }

  report = {
    ...report,
    rulesState,
    verificationBinding: afterBinding,
    verificationInputDrift,
    inputMutationDetected,
    exitCode: options.strict && verificationState !== "verified" ? ExitCodes.NEW_FAILURE : report.exitCode,
    verification: {
      state: verificationState,
      reason: verificationReason,
      configuredChecksCount,
      executedChecksCount,
      activeRulesCount,
    },
  };

  try {
    await persistVerificationSummary(repoRoot, report);
  } catch (error: unknown) {
    process.stderr.write(
      renderError(
        format,
        `Failed to persist verification evidence: ${
          error instanceof Error ? error.message : String(error)
        }`,
        ExitCodes.INTERNAL_ERROR
      )
    );
    return ExitCodes.INTERNAL_ERROR;
  }

  // 7. Update safety log
  try {
    const logCheckResults: LogCheckResult[] = report.results.map((r) => ({
      name: r.name,
      result: r.result,
      before: (r.before ?? "unverified") as CheckLogState,
      now: (r.now ?? "unverified") as CheckLogState,
    }));
    const totalDurationMs = currentResults.reduce(
      (sum, r) => sum + (r.durationMs || 0),
      0
    );
    const hasErrorViolations =
      report.ruleViolations?.some((v) => v.severity === "error") ?? false;
    const regressionDetected = report.summary.newFailures > 0 || hasErrorViolations;

    await updateLastEntry(
      {
        baselineId: baseline.git.headCommit ?? "baseline",
        trigger: options.trigger ?? "cli",
        checkResults: logCheckResults,
        fileSummary: {
          added: report.files.added.length,
          modified: report.files.modified.length,
          deleted: report.files.deleted.length,
          unchanged: report.files.unchangedCount,
        },
        regressionDetected,
        durationMs: totalDurationMs,
      },
      repoRoot
    );
  } catch {
    // Safety log update failure should not break check execution
  }

  process.stdout.write(renderCheckReport(format, report));

  return report.exitCode;
}
