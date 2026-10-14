# 1.1.0-preview.1 — Experimental developer preview

This is an opt-in developer preview, **not general availability, universal IDE support or a security/accessibility certification**. Use disposable/test repositories first. Keep your own backups and review changes; Safe-Change is an additional safety layer, not a guarantee against data loss.

## Distribution

The GitHub `Developer Preview` workflow packages the exact source commit, waits for all 11 independent required checks from the same commit and trusted GitHub check apps, verifies artifact hashes/manifest, then creates a **prerelease** with `latest=false`. It does not merge the branch, publish npm packages, modify the stable npm tag or bypass an npm environment approval. The workflow is limited to the approved repository and feature branch. A failed/missing CI result blocks publication; it does not automatically reduce test scope.

Download the `.tgz`, `SHA256SUMS`, manifest and this report from the preview GitHub release. Verify the digest before installing. The tested install route is the TypeScript fallback, deliberately omitting optional native packages:

```sh
sha256sum -c SHA256SUMS
npm install --global ./safe-change-1.1.0-preview.1.tgz --omit=optional --ignore-scripts
safe-change --version
safe-change --help
```

Run the checksum command in the directory containing all checksum-listed assets. Native npm packages for this preview are not published, so do not claim preview native package installation was tested. Public npm publication was not attempted because npm publication credentials are unavailable. A GitHub tag/archive is not evidence that an npm version exists.

## Code review and fixes

All 64 original `CODE-EMPTY-CATCH` candidates were triaged at source commit `0416054ce4b105260e8c9ebd03478530ce2be44b`. [Full review ledger](preview-internal-review.json): 3 targeted fixes, 29 retained best-effort/fallback cases, 20 test/experiment cleanup cases and 12 follow-up diagnostic/validation-hardening cases. This scoped triage is not an independent audit or a claim of zero remaining defects.

Implemented fixes:

- Failed installation recovery retains the backup and reports both the original and restoration failures. A missing known backup is an explicit recovery error, not “nothing to restore”. Filesystem failure injection verifies backup preservation.
- Failed transaction restoration is no longer hidden behind only the original commit error; the retained backup location is reported.
- Init refuses known linked/non-regular overwrite targets and unreadable gitignore content instead of replacing unknown input. These checks are not race-proof OS confinement.
- npm publication arguments send prerelease versions to `preview`, not `latest`. Existing GitHub release logic labels prereleases accurately; **no npm publication occurred**.
- Actual browser inspection found low-contrast caption/table text and an unfocusable horizontal table region. Caption contrast and keyboard-focusable scroll regions were corrected, with visible focus/reduced-motion handling. The original errors were not suppressed in axe.

## Clean package and real MCP transport

`scripts/smoke-test-tarball.mjs` installs the actual tarball in a fresh isolated project with lifecycle scripts and optional native packages disabled. It does not link the development node_modules into that project, and generated node_modules/state are excluded from the fixture's Git history.

Passed locally:

- Version/CLI startup from the installed tarball.
- A real passing behavior check and current quality gate.
- Controlled regression produces strict check exit 1 and a failing quality gate.
- Hook asks before a timing choice, blocks unresolved completion and denies an observed scope violation.
- Noninteractive timing self-approval is rejected.
- Installed MCP server is launched over **actual stdio**, discovers exactly five tools and reports the controlled regression.

This is hook protocol and MCP transport validation, **not a live IDE/agent session**. No installed/authenticated Claude, Codex, OpenCode or desktop IDE host was available. Native permission dialog behavior, automatic skill invocation and end-to-end IDE enforcement remain **BLOCKED / NOT VERIFIED**, not PASS. A generic SDK client does not substitute for those tests.

## Live external scanner fixtures (Linux x64)

| Tool | Pinned version | Actual validation |
| --- | --- | --- |
| Gitleaks | 8.30.1 | Clean history exit 0; synthetic credential history exit 1 with a confirmed detection and redacted output |
| Semgrep | 1.168.0 | Clean JS exit 0; local reviewed eval rule finds controlled code, exit 1; actual Safe-Change strict/quality gate transitions verified/PASS to failed/FAIL |
| Trivy | 0.75.0 | Clean filesystem/dependency fixtures exit 0; synthetic secret, known vulnerable dependency and Dockerfile misconfiguration each produce confirmed detections and exit 1 |
| OSV-Scanner | 2.7.0 | Clean lodash 4.18.1 fixture exit 0; vulnerable lodash 4.17.20 fixture exit 1 with known advisory matches |
| Playwright | 1.64.0 | Actual Chromium desktop/mobile test execution; native JSON report accepted as PASS_REPORTED for six positive tests |

All 11 recorded scanner cases matched expected exit codes and positive detections were checked separately from fatal execution errors. Official Gitleaks/Trivy/OSV download assets were checked against their GitHub release API SHA-256 digests; this is integrity checking against published metadata, not independent signer verification. Semgrep was pinned in a separate Python venv; browser tools were pinned in a separate npm prefix. No scanner installers/rules were vendored or automatically enabled in consumer projects. Databases may change; preserve snapshot identities for stronger reproducibility.

ORT/ScanCode license policy, Cosign signer/attestation policy, Scorecard thresholds and CodeQL findings enforcement remain setup-required. Scanner fixture success is not full security testing of arbitrary projects and does not establish lawful authorship, non-infringement or absence of unknown vulnerabilities.

## Browser and accessibility scope

Local dashboard tests used system Chromium via Playwright at 1440×900 and 390×900. Six actual Playwright tests covered tab activation/keyboard activation, page overflow and scoped axe-core checks across desktop/mobile projects. Additional direct browser checks reported no page JavaScript errors. axe-core 4.14.0 reported no violations for the tested empty-dashboard state after the fixes, under its WCAG 2 A/AA and WCAG 2.1 AA tag subset.

This does not certify all tabs/data states, screen readers, all viewport widths, Firefox/WebKit, visual taste or complete WCAG compliance. The tested dashboard is not an IDE. Repeat broader real-user tasks and manual accessibility checks before claiming more.

The reproducible optional local probe is `scripts/verify-dashboard-browser.mjs`. Set `SAFE_CHANGE_BROWSER_TOOLS` to an isolated node_modules containing the pinned Playwright/axe packages and `SAFE_CHANGE_CHROMIUM` to your reviewed local Chromium executable. Build first. It uses sandbox-local HTTP only, not production accounts or a shared browser session.

## Evidence and feedback

[Machine-readable live evidence](preview-validation.json) includes exact versions/download digests, scanner exits/detection confirmation, gate outcomes, browser findings and report assessment. Raw credentials, secret scan contents and private source are not attached.

Use the repository's **Developer preview feedback** issue form. Record version/commit, OS/Node/IDE version, a minimal disposable reproduction, expected/actual behavior and redacted command outputs. Do not send credentials or private source. Feedback has not yet been collected; improvements based on real early-user reports remain future work.

Known gaps: live IDE consent/invocation, automatic watcher recovery, advanced policy integrations, comprehensive UI/UX evaluation and the twelve follow-up internal review candidates. Do not present this preview as perfect, universally production-ready or an autonomous security boundary.
