# Candidate stabilization observation

## Authorization and scope

The repository owner approved a minimum of 14 consecutive days and authorized starting the observation. The frozen test candidate is `5e99b4f12b27890df22ea5bb4e4e0151c68b89ec` (`1.1.0-preview.1`). Its application code must not move with the observation workflow or documentation commits.

This is a **14-day periodic regression observation**, not a single process running continuously for 336 hours. Fresh GitHub-hosted runners and test fixtures cannot establish long-lived process memory stability, persistence across machine restarts, or real production workload stability. Native target and Node-version coverage remain supported by the separate existing CI matrices; this observation uses Node 20 on Ubuntu, Windows, and macOS.

## Initial observation record

- Initial evidence run: https://github.com/zackpratamaa/safe-change/actions/runs/39656102889
- Workflow controller revision: `d7e5d1d7dbc5eada5f4b23044735d4f6d9ceef7d`; tested application source: `5e99b4f12b27890df22ea5bb4e4e0151c68b89ec`.
- First Ubuntu/macOS runner jobs started at **2026-10-21T18:49:06Z** (2026-10-22 01:49:06 Asia/Jakarta); the Windows runner started one second later. These are runner job timestamps, not an invented exact process-start timestamp. The checkout-verified `start.json` artifact holds the actual workload start for each platform.
- Ubuntu's first successful observation completed at **2026-10-21T18:50:57Z**; macOS completed successfully at **2026-10-21T18:51:16Z**. The initial run subsequently completed successfully on all three platforms, including Windows. The linked run remains the authoritative per-platform result.
- `stabilization.startedOn` records the actual UTC start date, 2026-10-21. For a conservative elapsed-time evaluation, do not close the observation before **2026-11-05T00:00:00Z** (2026-11-05 07:00 Asia/Jakarta). This is a planned earliest evaluation, not an actual end date or a promised pass. Verify the workload timestamps and all daily evidence before closing.
- The initial run remains evidence even if a later platform or run fails. Do not remove it or restart history to obtain a green period.

## Operation and evidence

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
