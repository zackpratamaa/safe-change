# Scoped independent security review brief

**Status: draft scope, not an audit report. No independent reviewer, completed engagement, findings closure or certification is asserted by this document.**

This brief was prepared only after Phases 0–5 had actual completion evidence in PRs #27–#32. The starting source inventory is commit `bd03b2f68f26a08246971978d391b58ccdeaf5a2`. Before an engagement, the maintainer and reviewer must agree an immutable target SHA, supported runtime/platform matrix, time budget, disclosure contact and deliverables. Rebase fixes require a separately identified retest SHA; never silently extend a result to later releases.

## Objective and boundaries

Evaluate whether the following mechanisms do what their documented boundaries say, not whether marketing labels sound plausible. The authoritative equal-OS-user limitation remains [SECURITY.md](../SECURITY.md#threat-model): a peer with the same filesystem privileges can replace/delete local state, logs and trust configuration. Checksums and locally supplied keys do not establish an external root of trust. Tests below are starting material, not evidence that an independent review has occurred.

### 1. Ed25519 DSSE / in-toto attestation path

Source entry points: [canonicalization](../src/attestation/canonical.ts), [DSSE PAE and signatures](../src/attestation/dsse.ts), [statement construction and verification](../src/attestation/manager.ts), [CLI orchestration](../src/commands/attest.ts), and the identity directory under `src/identity/`.

Review questions:
- Does canonicalization match the claimed JSON domain and reject unsupported/ambiguous values? Distinguish a tested subset from full RFC 8785 interoperability.
- Are payload type, byte lengths, PAE, declared signer/key selection, algorithm and subject/predicate bindings independently checked?
- Are malformed envelopes, missing fields, invalid encodings, unsupported types, empty/duplicate subjects and expiration failures handled without an unhandled exception or misleading success?
- What authenticates the supplied public key and approver registry outside the writable workspace? Document key substitution, revocation, rotation and offline freshness limitations rather than calling a valid signature trusted identity.
- Does attestation creation bind current evidence/artifact digests, or merely sign caller assertions? Are secret-bearing outputs and key file permissions handled deliberately?

Starting tests: `tests/unit/cryptographic-attestation.test.ts`, `tests/unit/approval-identity-signing.test.ts`, `tests/unit/verifiable-execution-coverage.test.ts`. Ask the reviewer for independently authored vectors and differential interoperability checks in an isolated disposable workspace, not just reruns of these tests.

### 2. Policy-root verification

Source: [policy-signature.ts](../src/enforcement/policy-signature.ts), [configuration](../src/enforcement/config.ts), [policy CLI](../src/commands/policy.ts), and the relevant config loader/decision callers.

The current signature verifier reads `signature.publicKeyPem` from the supplied signature object; its signature/digest result alone is **not** independent policy-root pinning. Review how the caller obtains and authorizes that key, how required/missing/invalid signatures affect decisions, which fields are signed, and how downgraded configuration or a substituted key is surfaced. Assess whether rollback/version/expiry controls exist at the actual enforcement boundary; mark missing controls as gaps, not implied guarantees.

Starting tests: `tests/unit/enforcement-core.test.ts`, `tests/unit/enforcement-commands.test.ts`, `tests/unit/enterprise-risk-engine.test.ts`. Identify any untested caller/CLI path separately.

### 3. Command-sandbox allowlist boundary

Source: [allowlist/environment decision](../src/enforcement/sandbox.ts), the executor under `src/runner/`, process lifecycle code under `src/security/`, and the OS providers under `src/sandbox/`.

Review executable identity and PATH resolution versus the basename/string allowlist, exact argument-denial semantics, environment inheritance, working directory, output redaction, timeouts and child-process cleanup on each supported OS. Distinguish policy evaluation from OS-enforced isolation: an allowed general-purpose interpreter is not a confinement boundary. In particular, check that a requested network denial fails closed if a mandatory capable provider is unavailable. Review Linux provider capability reports against actual execution, without extending that evidence to Windows/macOS.

Starting tests: `tests/unit/command-sandbox.test.ts`, `tests/unit/os-sandbox-enforcement.test.ts`, `tests/unit/linux-sandbox-capabilities.test.ts`, `tests/integration/live-linux-isolation.test.ts`, and process-controller tests.

## Required reviewer handoff

- Exact audited SHA, dependencies, tool versions, platforms, dates and exclusions.
- Methods and independent test vectors, including negative/failure-path results and limitations.
- Per-finding affected boundary, impact, severity rationale, reproducible isolated test, proposed fix and regression test; sensitive details follow the security disclosure process, not a public exploit recipe.
- Maintainer response and retest evidence at a named fix SHA, clearly separating unresolved, accepted-risk and verified-fixed findings.
- Publish a scoped report/redacted summary with reviewer consent. Until that exists, keep “not yet independently reviewed” labels. A green CI run, a self-generated evidence bundle and a signed envelope are not substitutes for this review.

License and copyleft wording remain outside this engineering scope. Any business/legal licensing decision requires the owner's separate decision; this brief does not recommend or implement a license change.
