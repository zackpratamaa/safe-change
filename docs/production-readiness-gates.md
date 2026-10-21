# Production readiness and GA release gates

`safe-change` remains a preview. Passing CI is necessary but does not by itself establish production stability, independent security assurance, or general availability.

A stable SemVer tag is blocked until `docs/ga-readiness.json` records all of the following for the exact tagged commit:

1. **An explicitly approved stabilization duration.** The record must state the chosen minimum, actual start and end dates, source-SHA-bound run links, and a resolved incident ledger. This repository does not invent historical soak time.
2. **An independent security review.** The report must cover Ed25519/DSSE/in-toto behavior, policy trust-root verification, and the command allowlist versus OS-isolation boundary. It must identify the audited commit and a retest of the candidate commit, with zero open critical or high findings.
3. **Human GA approval.** The record must link the decision and name its approver(s).
4. **The existing release checks.** Version parity, package compatibility, native execution, source-bound self-evidence, artifact hashes, and publication controls remain mandatory.

## Approved stabilization minimum

The approved minimum soak duration is **14 consecutive days**, recorded as `stabilization.minimumDays: 14` in `docs/ga-readiness.json`. Approval of this duration is not approval of GA publication and does not start or complete the soak.

Before starting, freeze the exact candidate SHA and record the actual start date. Preserve source-SHA-bound test-run evidence and every incident, including failed runs; do not reset the recorded history or rerun until green to hide failures. Any candidate code change requires reassessing the candidate and affected testing rather than silently carrying over elapsed soak time. Record the actual end date only after the observation period has elapsed, and resolve every incident with linked evidence before requesting GA approval.

The current readiness record is deliberately `blocked`. It is not evidence that a soak, independent audit, or GA approval has happened. Preview tags remain possible under the existing preview controls; removing preview/experimental labels or creating a stable tag before the record is genuinely complete is prohibited.

Even after GA, an actor with the same OS-user filesystem permissions can modify or delete local state; that threat-model limitation is unchanged.
