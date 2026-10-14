# Verifiable Execution Architecture and Threat Model

This describes implemented components, not an automatically composed universal
security pipeline. Executable syntax: [Verifiable Execution Guide](verifiable-execution.md).

## Components and boundaries

| Component | Actual boundary |
|---|---|
| Baseline/check | Configured check comparison; strict requires verified state |
| Verification binding | Git-visible source/index, full baseline, environment digest; pre/post mutation detection |
| Oracle guard | Conservative drift guard for tests, runner manifests/configs, CI, custom paths |
| Semantic diff | TS/JS/JSON heuristics, including deletion; not full correctness proof |
| Authorization | Policy decision, approvals, scope, expiry, audit; caller must enforce it |
| Write lease | Cooperative session ownership, not mandatory OS filesystem locking |
| Sandbox | Direct spawn, timeout/output/redaction; optional Linux isolation and portable limitations |
| Replay | Metadata verification by default; detached-worktree rerun only when requested |
| Attestation | Ed25519 DSSE/in-toto signing; trust/fresh behavioral checks are separate |
| Identity | Local key registry and optional signed grants; legacy identifiers are distinct |

## Trust and limitations

Repository text, agent suggestions, dependencies, and output are untrusted data.
Configuration and commands need operator review: they execute with user privileges.
Safe-Change assumes single-user/cooperative execution. Hostile same-account actors
can bypass local tools, replace state, or mutate and restore inputs between
observations. Stronger isolation requires external protected CI/OS/container
boundaries and controlled baseline acceptance.

Checks cover configured behavior, not every old feature. Protected conventional
oracle paths do not discover all indirect/external inputs; configure custom paths.
Bindings cover Git-visible files plus fingerprint inputs, not ignored outputs,
external services, arbitrary environment values, or installed dependency contents.
Evidence is point-in-time. Local digest chains can be rebuilt without external
anchors. Semantic findings are heuristics. Process termination/path checks are
not absolute confinement of hostile privileged processes.

Environment inheritance is enabled by default. Allowlisting requires disabling
inheritance. Redaction is pattern-based. macOS/POSIX and native Windows cannot
provide mandatory network denial or read-only workspace. Check's executor requests
writable workspace. Linux isolation requires usable bwrap. Thirteen replay enum
values include reserved categories; default replay verification does not rerun.

## Keys

SHA-256 digests and Ed25519 policy/approval/attestation signatures are implemented.
DSSE payloads use the project's canonicalization implementation. Policy signatures
cover enforcementPolicy, not every configuration property. Registry roles are
security-lead, release-manager, lead-maintainer, and developer. Identity keygen
writes PEM files under ignored `.safe-change/keys/`; protect approved signing keys
and registry ownership externally. Never commit/log private keys.

## Recommended orchestration, not automatic CLI behavior

```text
Reviewed baseline and protected oracle policy
  -> optional lease and authorization
  -> bounded edit
  -> required risk/semantic/repository gates
  -> check --strict on stable inputs
  -> fresh evidence
  -> optional replay reexecution and attestation
  -> external CI release approval
```

Check alone does not acquire leases, intercept all writes, invoke all modules,
require every signature, or authorize release. Fingerprint/oracle drift or input
mutation can yield not-verified; current failure/blocking rules yield failed.
Strict check exits nonzero unless verified. Plain check preserves its legacy
no-new-regression contract. Stale/missing/unbound evidence is not-verified.

See [Verification integrity](verification-integrity.md) and [SECURITY.md](../SECURITY.md).
