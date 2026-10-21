# Candidate stabilization observation

## Authorization and scope

The repository owner approved a minimum of 14 consecutive days and authorized starting the observation. The frozen test candidate is `5e99b4f12b27890df22ea5bb4e4e0151c68b89ec` (`1.1.0-preview.1`). Its application code must not move with the observation workflow or documentation commits.

This is a **14-day periodic regression observation**, not a single process running continuously for 336 hours. Fresh GitHub-hosted runners and test fixtures cannot establish long-lived process memory stability, persistence across machine restarts, or real production workload stability. Native target and Node-version coverage remain supported by the separate existing CI matrices; this observation uses Node 20 on Ubuntu, Windows, and macOS.

## Operation and evidence

- The first actual checkout-and-start evidence in the initial workflow run defines the observation start. Merely creating this document does not start the clock. Record that UTC timestamp and run URL after verifying the run exists.
- Each run checks out the exact frozen SHA, verifies HEAD, and records both candidate SHA and workflow revision. The Actions run head identifies the controller revision, not the tested candidate; inspect `start.json` in its evidence artifact.
- Run the existing coverage suite without changing its thresholds, semantic corpus, three additional rounds of concurrency/state/replay/dashboard checks, and packaged CLI/MCP/Java smoke checks.
- The initial branch push starts the first run. Once this workflow is merged into the default branch, scheduled observation is requested daily at 02:23 UTC / 09:23 Asia/Jakarta. Until then, daily automation is not active. GitHub can delay or omit scheduled jobs; missing observation days require investigation, not an assumption of success.
- The automatic workload cutoff is 2026-11-06T00:00:00Z. This conservative planned cutoff is not a completion timestamp or an automatic GA decision. After that time the workflow's window check skips the test jobs.
- Every attempt retains source/time/outcome metadata, command logs, and measured coverage for 90 days. Export artifacts before expiry if needed for release evidence.
- No automatic retries, cancellation of older jobs, or automatic readiness promotion are configured. Preserve original failures even if a diagnostic rerun is later needed. A failed run, timeout, missing run, or infrastructure error belongs in the incident ledger with its URL and disposition; never relabel it as a pass.

## Completion requirements

A maintainer must verify at least 14 full elapsed days from the actual start, adequate daily observations without unexplained gaps, every test run and incident, and resolution evidence. Date-only fields in `docs/ga-readiness.json` do not replace the exact timestamp evidence. Keep `endedOn` unset until the observation has actually ended.

Changes to candidate code require explicit reassessment and, where necessary, a new candidate and observation period. Controller/documentation revisions must stay distinguishable from tested application revisions. A future release on a different exact SHA still requires source-bound validation and approval; this observation must not be silently relabeled as evidence for another SHA.

Readiness remains `blocked`. No independent security review, human GA approval, stable tag, or release is supplied by this observation.
