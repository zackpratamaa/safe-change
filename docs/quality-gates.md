# Experimental quality gates (unreleased)

Safe-Change preserves existing behavior. Quality checks complement that core; they do not replace it, authenticate human authorship, prove non-infringement, or guarantee secure/usable software.

## Implemented vs setup required

| Capability | Implemented here | Still required |
| --- | --- | --- |
| Code/UI anti-slop | Original AST/lexical heuristics and structured review findings | Project rules, maintainability review, real design critique |
| Delivery gate | Required check names, strict current-evidence binding, bounded report age | Trusted checks and reviewed policy |
| SARIF report assessment | Nonempty completed runs; any finding requires review | Trusted producer, source coverage, same-invocation regeneration |
| Playwright report assessment | Positive test counts, consistent results; no skips/flakiness/expected failures | Actual browser tests and assertion review |
| Trivy, Semgrep, Gitleaks, OSV, Playwright | Inert check templates compatible with the existing executor | User-installed pinned binaries/rules/browsers, permission review, live validation |
| ORT, ScanCode, Cosign, Scorecard, CodeQL | Setup-required profiles with explicit policy requirements | Project-specific trusted pipeline, identity/digest/license/security policy |

No scanner, installer, model or network request is started by `quality scan`, `quality profile`, `quality report` or `quality gate`. Profile generation does not edit configuration. Existing execution remains opt-in through user-reviewed `.safe-change.json` checks and the existing command/OS sandbox policy. No new MCP tools were added.

## 1. Limited local audit

```sh
safe-change quality scan --json
```

The audit reads supported Git-visible JS/TS/JSX/TSX, CSS/SCSS and HTML files. It excludes `node_modules`, `dist`, `coverage`, `vendor`, `target` and `.d.ts` files. Ignored and external inputs are not covered. Candidate count is bounded at 10,000 and each file at 1 MiB, with a 32 MiB aggregate source budget and bounded finding counts. Unreadable, oversized or linked files fail with ERROR instead of being silently treated as clean. Symlink checks are cooperative checks, not race-proof OS confinement.

Original rule identifiers:

- `CODE-PARSE`: source did not parse.
- `CODE-EMPTY-CATCH`: empty catch requires an intentional error-handling decision.
- `CODE-FOCUSED-TEST`: direct `test/it/describe.only` chains can exclude the suite.
- `CODE-DISABLED-TYPECHECK`: comment disables file-wide type checks.
- `UI-IMAGE-ALT`: JSX image alternative text missing/unknown behind a spread.
- `UX-SEMANTIC-ACTION`: clickable JSX div/span needs semantic and keyboard review.
- `UI-TRANSITION-ALL`: broad CSS transition requires review.
- `UX-ZOOM-DISABLED`: HTML/CSS text appears to disable zoom.

`CLEAN_LIMITED` means only that these narrow heuristics found nothing. It is NOT a general PASS for security, design, accessibility, licensing or UX. `REVIEW` is nonzero; findings may be intentional/false positives and are never autofixed. Zero supported files yields `NOT_VERIFIED`, not a clean audit. Findings contain rule/path/line/reason, not source snippets. HTML is not a full DOM parser; JSX does not cover templates in every framework. Dynamic code, custom components and runtime-generated attributes require other checks.

No blanket gradient/card/font bans, no AI-authorship detector, and no aesthetic score. Native semantic HTML, task success and user needs matter more than an arbitrary visual blacklist.

## 2. Add only relevant external checks

```sh
safe-change quality profile --json
safe-change quality profile trivy --json
safe-change quality profile semgrep --json
safe-change quality profile playwright --json
```

A `check-template` profile contains a compatible check definition. Review its command and prerequisites before copying it into **your existing** `.safe-change.json`; do not replace existing tests, policies or baselines. A `setup-required` profile intentionally has no runnable check: a success exit from inventory generation, report upload or a low Scorecard result must not become compliance approval.

Before executing:

1. Pin the executable release/digest, rules, DB snapshot and browser version separately. The reference source commit ledger does not install or pin an executable.
2. Review each tool's network/cache/filesystem/credential behavior, resource cost and own license. Install separately with user approval; no remote `npx`, `curl | sh`, installer or global agent-pointer edits here.
3. Add only the executable, environment and access needed to the existing enforcement policy. Do not disable default-deny, expand all environment access, or grant credentials just to obtain a green check.
4. Fail on missing tools, unsupported inputs, scanner/config errors, truncated reports and unavailable data. Define severity/ignore/license thresholds explicitly.
5. Protect rules, policy, wrappers and UX tests as verification inputs. Templates stored under `security/` must be included in `protectedVerificationPaths`, for example `security/**` and `quality-policy.json`. A normal source hash detects staleness; protected paths additionally prevent changing the oracle without review.
6. Configure these checks before saving the accepted pre-change baseline. Preserve old behavior checks; do not manufacture a passing baseline after the change.

The templates were inspected against the pinned source interfaces; **external scanners were not installed or live-executed in this increment**. Missing/configured-out capabilities are not PASS. Binary/platform/version differences still require validation.

### Tool boundaries

- **Trivy** template covers HIGH/CRITICAL vulnerability/secret/misconfiguration findings, not every severity or license policy. License scanning must be configured and policy-evaluated separately.
- **Semgrep** uses a reviewed repository-local `security/semgrep.yml`, not mutable remote `auto` rules. Engine/rule/product licenses differ. Protect the rule file.
- **Gitleaks** redacts output and scans available Git history. Shallow clones cannot prove full-history coverage. Real leaks require revocation/rotation, not only deletion.
- **OSV** checks supported dependencies against known vulnerabilities; inspect skipped manifests and database coverage. Network/database availability is a prerequisite.
- **ORT** needs analysis plus policy evaluation and review of unresolved issues. SBOM generation is inventory, not legal clearance.
- **ScanCode** detects licenses/copyright; apply an explicit expression/obligation policy, handle unknowns and scan errors. It cannot establish lawful ownership of every line.
- **Cosign** must verify an immutable artifact digest against exact trusted identity/issuer, plus subject/predicate policy for attestations. Never accept a signature solely because it is cryptographically valid under an arbitrary signer. No simulated verification from JSON.
- **Scorecard** needs an upstream revision and a policy for individual checks/unavailable results, not a universal trust score.
- **CodeQL** action/upload success does not establish zero alerts. Gate findings through a reviewed GitHub code-scanning policy. Keep actions SHA-pinned and review private-repository licensing separately. Existing CodeQL workflow is preserved, not replaced.
- **Playwright** requires actual tests and browser binaries. Avoid privileged production accounts/real payments; test a disposable environment. Add axe-core for automated accessibility and manual keyboard/screen-reader/design review; no bundled axe dependency or automatic WCAG certification.

## 3. Assess native reports conservatively

```sh
safe-change quality report sarif --file .safe-change/codeql.sarif --json
safe-change quality report playwright --file .safe-change/browser.json --json
```

Only JSON SARIF 2.1.0 and Playwright reporter JSON are supported. Inputs must be bounded regular repository-local files (8 MiB maximum); unknown/missing formats, incomplete metadata and scanner invocation failures cannot pass.

- SARIF: all runs need named tools, results arrays and successful invocation metadata. Warnings/errors in invocation notifications require review; all reported results, including suppressed/informational findings, produce FAIL. Zero reported findings does not prove that useful code was scanned.
- Playwright: positive actual test results must match stats; global errors, skipped/flaky/failed tests and expected failures do not pass. Missing/inconsistent counts produce NOT_VERIFIED. Assertions and intended route/browser coverage still require review.

`PASS_REPORTED` is deliberately not `PASS`: **importing JSON does not authenticate its author, execution time, scanned revision or source binding**. Regenerate the report from the actual scanner inside the same trusted check invocation, propagate scanner failure and only then assess it. Do not register a standalone stale-file importer as the sole security/UX check. Reports may contain secrets; do not commit or echo raw reports. These importers print counts/reasons, not raw findings.

## 4. Gate delivery on current named checks

Create a reviewed, committed `quality-policy.json` (see [example](../examples/quality/quality-policy.json)):

```json
{
  "version": 1,
  "requiredChecks": ["test", "security-semgrep", "ux-browser"],
  "maxAgeSeconds": 3600
}
```

Use only checks actually configured for this project. Missing names fail closed. Names are declarations, not proof that the chosen command checks the intended property.

```sh
safe-change save "accepted pre-change behavior and quality checks" --json
# Implement the scoped change without weakening tests or policy.
safe-change check --strict --json
safe-change quality gate --file quality-policy.json --json
```

The quality gate is a **post-check delivery gate**, not a check to put inside `.safe-change.json` itself (that would read previous evidence). It requires a verified summary with exit 0, matching current source/index, baseline and environment digests; timestamps must be finite, not future and within the configured 1–86,400 second limit. Every required named check must exist, return exit 0, and report no timeout, blocked output or detected secrets. Duplicated/ambiguous evidence does not pass. No checks are executed by the gate, and it does not create/rewrite evidence.

Use session requirement-to-check mappings where task completion also needs those checks. `quality gate` does not automatically wire itself into an IDE, watcher, session or CI configuration.

## Design and experience review

For UI work, persist the intended audience/task, project visual direction, information hierarchy, primary action, content truthfulness, loading/empty/error/success/offline states, mobile/desktop behavior, keyboard/focus path, motion preferences and measurable acceptance criteria. Use [the review template](../examples/quality/design-review.md). Review copy for substantiated claims and actionable errors, not an arbitrary human-like writing score. This is reader/agent guidance, not a machine-enforced design contract parser or authenticated approval.

Browser tests should check real user tasks, form validation, navigation, focus return, zoom/reflow, long/localized content and error recovery. A screenshot or PASS written by an agent is not sufficient evidence that those tasks worked. The Safe-Change observer continues to observe only while its separately started process runs; quality checks do not confer new write/network/spend permissions.

## Exit codes and trust

- `scan`: 0 CLEAN_LIMITED; 1 REVIEW/NOT_VERIFIED.
- `report`: 0 PASS_REPORTED; 1 FAIL/NOT_VERIFIED.
- `gate`: 0 PASS; 1 FAIL/NOT_VERIFIED.
- `profile`: 0 for an existing profile/list, without execution.
- Usage, unsafe input or read/parse errors: 3.

Same-user agents can forge local reports, replace tools/policy or bypass commands. Use external enforcement/signed approval boundaries where required. Static scans, manual review, license inventories, vulnerability scans, behavioral regression tests and signed artifact provenance answer different questions. None is a substitute for all the others.

See [reference audit](quality-reference-audit.md) for pinned source identities, license boundaries and installer review.

### Self-audit observation

The new heuristic audit was also run against Safe-Change itself: it reported REVIEW for 64 empty-catch patterns across 192 inspected supported files before this increment's final test additions. These are review candidates, not 64 confirmed vulnerabilities; deliberate best-effort cleanup/error suppression exists in the codebase. They were not automatically rewritten, hidden or represented as a clean self-audit. This increment adds the audit mechanism, not a claim that all maintainability findings have been resolved.
