# Safe-Change Verifiable Execution Guide

This describes current source, not proof that every feature is in an older npm
release. Check your installed version/commit. These modules are separate controls;
`check --strict` does not automatically invoke them all. See
[Verification integrity](verification-integrity.md).

## Semantic diff

```bash
safe-change semantic-diff --json
safe-change semantic-diff --base origin/main --fail-on high --json
```

Built-in TS/JS and JSON adapters use heuristics, not behavioral equivalence
proofs. Default threshold is critical. Test skip/todo and lower `expect` count
can be critical. Deleting/emptying non-empty supported source produces critical
`source-file-deleted`; invalid Git bases fail closed. Check separately protects
conventional tests, runner configs/manifests, CI, and custom oracle paths.

## Replay

```bash
safe-change replay record session-example --json
safe-change replay inspect .safe-change/replay/session-example-replay.json --json
safe-change replay verify .safe-change/replay/session-example-replay.json --json
safe-change replay verify .safe-change/replay/session-example-replay.json --reexecute --json
```

Record uses baseline results/configured commands; it does not rerun checks.
Default verify validates metadata/integrity/drift; `--reexecute` reruns in a
detached worktree. Replay `--strict` is an alias for reexecution, distinct from
check's verified-only gate. Runtime/path/platform differences may block replay.
Metadata verification is not a fresh behavioral test.

The declared categories in `src/replay/types.ts` are:
`REPOSITORY_DRIFT`, `COMMIT_DRIFT`, `CONFIGURATION_DRIFT`, `POLICY_DRIFT`,
`DEPENDENCY_DRIFT`, `ENVIRONMENT_DRIFT`, `COMMAND_DRIFT`, `OUTPUT_DRIFT`,
`EXIT_STATUS_DRIFT`, `ARTIFACT_DRIFT`, `SECRET_REDACTION_DRIFT`,
`SANDBOX_CAPABILITY_DRIFT`, and `NON_DETERMINISTIC_RESULT`.
`ARTIFACT_DRIFT` and `SANDBOX_CAPABILITY_DRIFT` currently have no independent
runner detector; thirteen declared categories do not mean thirteen complete
detectors. Exit/output/redaction/duration comparison needs reexecution.

## Identity and approvals

```bash
safe-change identity keygen lead-sec-01 --json
safe-change identity register lead-sec-01 .safe-change/keys/lead-sec-01.public.pem security-owner security-lead 365 --json
safe-change identity list --json
safe-change identity verify --json
safe-change approval sign <request-id> security-owner lead-sec-01 .safe-change/keys/lead-sec-01.private.pem security-lead --json
safe-change approval verify <request-id> --json
```

Create a scoped approval request before signing it. Keygen writes PEM keys under
`.safe-change/keys/`, prevents overwrite, and restricts private-file permissions
where supported. Keep `.safe-change/` ignored. Generated keys alone do not prove
organizational trust. Registry roles: security-lead, release-manager,
lead-maintainer, developer. Legacy `approval grant` identifiers are not
cryptographically authenticated; signed grants are a distinct route.

## Attestation

```bash
safe-change attest create session-example --private-key /secure/approved-attestation.private.pem --key-id build-authority-1 --json
safe-change attest verify .safe-change/attestations/session-example.attestation.json --public-key /secure/approved-attestation.public.pem --json
```

Creation requires an approved key (`--private-key` or SAFE_CHANGE_ATTESTATION_KEY),
a passing baseline, clean committed workspace, verified checksummed evidence for
the session, replay verification, a non-blocking semantic report, and valid audit
chain. Prepare these prerequisites in sequence and read returned output paths.
Do not reuse stale inputs. Valid signatures prove the signed payload, not
arbitrary code correctness or organizational trust; verification does not rerun
tests by itself.

## Actual sandbox matrix

| Capability | Linux | macOS/POSIX fallback | Native Windows |
|---|---|---|---|
| Direct spawn, no shell expansion | Yes | Yes | Yes; Node/npm avoid cmd.exe |
| Temporary HOME, output limits | Yes | Yes | Yes |
| Environment allowlist | With inheritance disabled | With inheritance disabled | With inheritance disabled |
| Process-tree termination | Implemented | Implemented | Implemented |
| Mandatory network denial | Requires usable bwrap | Unavailable; request blocks | Unavailable; request blocks |
| Provider read-only workspace capability | Requires usable bwrap | Unavailable | Unavailable |
| CPU/memory/fd quotas | Not implemented | Not implemented | Not implemented |

The check executor requests writable workspace and inherits environment/network
by default. DEGRADED mode may run; mandatory unavailable isolation blocks.
Linux probes bwrap availability with `--version`; actual startup may still fail.
This is a sandbox for configured checks, not all actions of an AI agent. Proxy
variables are not mandatory network isolation.

## Adoption

Use `safe-change --help` and actual handlers as CLI source of truth. Use
`check --strict --json` for final verification. Review changed oracle inputs
before explicit baseline acceptance. Required authorization, risk, replay,
attestation, and release approvals need mandatory external orchestration.
