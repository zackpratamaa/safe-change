# Integrity Core

The Integrity Core provides cooperative writer leases, workspace fingerprints, bounded verification output, and checksummed evidence. These controls are separate; they do not impose mandatory OS locking.

## Safe workflow

```bash
safe-change lease acquire session-20260929 cursor
safe-change save "change intent"
safe-change fingerprint check

# Apply the bounded change.

safe-change assess --json
safe-change check --strict --json
safe-change evidence session-20260929 cursor
safe-change audit verify
safe-change lease release session-20260929
```

An active lease owned by a different session is a blocking conflict. A session cannot release another session's lease. Lease state is written atomically with owner-only file permissions where supported.

## Workspace fingerprint

Every new baseline contains a fingerprint over:

- Git HEAD and branch;
- a hashed remote identity;
- `.safe-change.json`;
- safety rules;
- discovered lockfiles;
- enterprise policy version;
- canonical skill;
- agent profile;
- Node.js version;
- operating system and architecture.

Fingerprint comparison reports explicit categories such as `HEAD_DRIFT`, `CONFIGURATION_DRIFT`, `DEPENDENCY_DRIFT`, `POLICY_DRIFT`, and `ENVIRONMENT_DRIFT`. Drift prevents a fully verified conclusion until it is investigated and a new baseline is intentionally recorded.

Remote URLs are hashed before persistence so credentials or private repository locations are not copied into evidence.

## Secret-output blocking

Verification stdout and stderr pass through a streaming redactor before bounded diagnostic retention. Detection:

1. removes the value from retained output;
2. emits a secret-class marker such as `[REDACTED:github-token]`;
3. records the detected classes;
4. forces the check to fail even when the underlying process exits with code 0.

The scanner covers common token, private-key, cloud-key, authorization-header, connection-string, and secret-assignment formats. It supplements provider secret scanning and does not replace credential rotation after exposure.

## Evidence bundle

`safe-change evidence <session-id>` creates:

```text
.safe-change/evidence/<session-id>/
├── baseline-summary.json
├── diff-summary.json
├── environment-fingerprint.json
├── manifest.json
├── verification-report.json
└── checksums.txt
```

The bundle stores no source file bodies and no captured command output. It records file paths, counts, verification states, environment identity, and cryptographic digests.

## Tamper-evident audit events

Lease and evidence operations append events to `.safe-change/events.jsonl`. Every event commits to the previous event digest. `safe-change audit verify` recomputes the chain and fails if an event was changed, removed, reordered, or inserted without rebuilding all following digests.

The local hash chain is not externally anchored and can be rebuilt by a local state writer. Replay and optional Ed25519 attestations exist as separate commands; trusted timestamps and remote transparency anchoring are not provided by this chain.

## Current boundaries

- The lease is enforced by Safe-Change-aware clients; operating-system mandatory locking remains future work.
- Evidence bundles are checksummed by default. Optional attestations can sign a payload separately; the trust of the signer must be established externally.
- Fingerprints intentionally hash remote identity instead of storing the remote URL.
- Secret detection is pattern-based and can produce false positives or miss unknown formats.
- Command allowlists/output controls exist. Network denial requires usable Linux bwrap; macOS/POSIX and native Windows requests block. CPU/memory/fd quotas are not implemented.
- Source-bound report freshness and protected oracle inputs are described in [Verification integrity](verification-integrity.md). Stale/missing/unbound evidence is not-verified; checksums alone do not prove freshness.