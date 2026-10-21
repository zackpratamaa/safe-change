# Production readiness and GA release gates

`safe-change` remains a preview. Passing CI is necessary but does not by itself establish production stability, independent security assurance, or general availability.

A stable SemVer tag is blocked until `docs/ga-readiness.json` records all of the following for the exact tagged commit:

1. **An explicitly approved stabilization duration.** The record must state the chosen minimum, actual start and end dates, source-SHA-bound run links, and a resolved incident ledger. This repository does not invent historical soak time.
2. **An independent security review.** The report must cover Ed25519/DSSE/in-toto behavior, policy trust-root verification, and the command allowlist versus OS-isolation boundary. It must identify the audited commit and a retest of the candidate commit, with zero open critical or high findings.
3. **Human GA approval.** The record must link the decision and name its approver(s).
4. **The existing release checks.** Version parity, package compatibility, native execution, source-bound self-evidence, artifact hashes, and publication controls remain mandatory.

The current readiness record is deliberately `blocked`. It is not evidence that a soak, independent audit, or GA approval has happened. Preview tags remain possible under the existing preview controls; removing preview/experimental labels or creating a stable tag before the record is genuinely complete is prohibited.

Even after GA, an actor with the same OS-user filesystem permissions can modify or delete local state; that threat-model limitation is unchanged.
