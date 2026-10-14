# Enterprise Enforcement Foundation

`safe-change assess` is the first executable enforcement layer for the v0.4 enterprise platform. It converts the policy described by the canonical agent skill into a deterministic, machine-readable preflight assessment.

## Scope

The assessment command:

1. Reads the current baseline and repository change set.
2. Assigns additive risk signals for documentation, tests, source code, dependencies, CI, deletions, authentication, migrations, releases, and suspected guardrail downgrades.
3. Caps aggregate risk at 100 and selects the minimum operating mode:
   - 0-19: `standard`
   - 20-49: `enhanced`
   - 50-79: `high-assurance`
   - 80-100: `critical-change`
4. Raises the selected mode to the configured `minimumMode` when policy requires a stricter mode.
5. Enforces file, line, deletion, public API, and lockfile budgets.
6. Requires baseline, test, coverage, and dependency-audit configuration when enabled by policy.
7. Returns exit code 1 when approval is required.

Assessment is not verification. Its JSON output always reports `verificationState: "not-verified"` because it does not execute the configured checks. Run `safe-change check --strict --json` and repository-specific gates after the edit.

## Configuration

Add `enterprisePolicy` to `.safe-change.json`:

```json
{
  "version": 1,
  "checks": [
    {
      "name": "test",
      "executable": "npm",
      "args": ["test"],
      "timeout": 120
    }
  ],
  "enterprisePolicy": {
    "policyVersion": 1,
    "minimumMode": "standard",
    "requireBaseline": true,
    "requireTests": true,
    "requireCoverage": false,
    "requireDependencyAudit": false,
    "requireDiffReview": true,
    "allowForcePush": false,
    "allowDestructiveGit": false,
    "changeBudget": {
      "maxFilesChanged": 12,
      "maxLinesAdded": 500,
      "maxLinesDeleted": 200,
      "maxPublicApisChanged": 0,
      "maxDeletedFiles": 0,
      "allowLockfileChanges": false
    }
  }
}
```

`allowForcePush` and `allowDestructiveGit` are fail-closed constants. Setting either to `true` is a configuration error, not an exception mechanism.

## Anti-policy-downgrade detection

The initial detector blocks review when the current Git diff appears to:

- add `continue-on-error: true`;
- add skipped or todo tests;
- remove assertions;
- weaken coverage enforcement;
- disable CodeQL, security checks, provenance, or required checks;
- replace an immutable action reference with a floating branch or major tag;
- introduce a force-push command.

This is a conservative textual detector. A flagged result requires human review; an unflagged result does not prove that the policy was preserved. AST semantic diff and signed approval grants exist as separate commands; assess does not automatically compose them. It cannot by itself intercept writes or approve a release.

## Evidence boundaries

`safe-change assess --json` reports:

- risk score, signals, automatic mode, and required mode;
- measured file and line scope;
- change-budget violations;
- policy blockers;
- whether approval is required;
- explicit evidence limitations.

Git line statistics do not include the contents of untracked files. Public API counting is a language-agnostic heuristic over changed lines. These limitations are emitted in every assessment.