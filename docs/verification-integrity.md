# Verification integrity and strict gates

## Meaning of verified

`verified` means the configured checks passed, definitions/environment were
comparable, protected verification inputs were unchanged from the accepted
baseline, and Git-visible inputs remained stable across this check execution.
It is not a proof of arbitrary program correctness or complete test coverage.

Use the strict gate for CI and agent workflows:

```sh
safe-change check --strict --json
```

Strict check exits `0` only for `verification.state === "verified"`; `failed`
and `not-verified` produce exit `1`. Configuration, execution, or inspection
errors retain their existing nonzero error codes. The report's `exitCode`
matches the process exit code.

Plain `check` preserves its legacy regression contract: no *new* failures can
return exit `0`, even when status is `failed` or `not-verified`. Do not use
plain exit `0` as a deployment approval. The replay `--strict` alias still
means reexecution.

MCP clients can request the same strict gate:

```json
{
  "name": "safe_change_check",
  "arguments": { "cwd": "/path/to/repository", "strict": true }
}
```

Read `verification.state` in the returned report. MCP `isError` distinguishes
tool/infrastructure errors, not permission to deploy.

## Snapshot binding and freshness

Each check stores a `verificationBinding` with digests of:

- Git-visible file contents, indexed hashes, and tracked status;
- the complete loaded baseline, not merely its Git HEAD;
- configuration, rules, locks, policy, skill, Git identity, and runtime through
  the existing workspace fingerprint.

File state is inspected again after checks. If it changed during execution,
the check cannot be verified; the file report uses the final inspected state.
`save` similarly rejects a baseline whose inputs mutate while checks run,
without replacing an existing baseline.

Evidence compares its current binding with the saved verification report.
`verificationFreshness` is `fresh`, `stale`, or `missing`. A stale or old
unbound report becomes `not-verified` in both manifest and packaged report.
Rerun check before generating evidence after changing source, baseline,
configuration, rules, or environment. Checksums establish document integrity,
not code correctness.

Verification summaries are written with atomic replacement. Evidence is a
point-in-time record, not a guarantee that files cannot change afterward.

## Protecting the test oracle

By default the check guards:

- files under `test`, `tests`, `spec`, `specs`, and `__tests__`;
- filenames containing `.test.` or `.spec.`;
- repository-local script paths supplied as configured command arguments.
- repository-local executable scripts, common runner configs/manifests
  (`package.json`, `Makefile`, `pyproject.toml`, `Cargo.toml`, pytest/tox,
  Vitest/Jest/Playwright/Cypress config, NYC config), and GitHub CI workflows.

Adding, removing, or changing these files makes an otherwise passing check
`not-verified`. This is deliberately conservative: legitimate test improvements
also require review and acceptance. It does not attempt to decide whether an
assertion edit is semantically equivalent.

Add non-conventional oracle inputs (fixtures, golden responses, contracts,
runner configuration) as repository-relative globs:

```json
{
  "version": 1,
  "protectedVerificationPaths": ["contracts/**", "fixtures/**", "vitest.config.ts"],
  "checks": [
    { "name": "test", "executable": "npm", "args": ["test"], "timeout": 120 }
  ]
}
```

Review changed tests and their rationale. Only an authorized operator should
then explicitly run `save` to accept the new baseline. Never rebaseline only
to make a regression disappear.

## Important boundaries

- Coverage is Git-visible files plus fingerprint inputs. Ignored outputs,
  external files, databases, network responses, arbitrary environment values,
  and dependency installation contents are not a hermetic input snapshot.
  Put required oracle inputs inside tracked repository paths. Avoid external
  symlink inputs and uncontrolled nondeterminism.
- Pre/post inspection detects observable changes, not every transient mutation
  that is restored between snapshots. Hostile same-account processes require
  an external OS/container/CI trust boundary and protected baseline/test policy.
- Local `save` remains an explicit baseline-acceptance action, not an identity
  approval mechanism. An agent with unrestricted same-user shell access can
  bypass local cooperative conventions. Restrict that access externally when
  approval must be mandatory.
- `authorize`, enterprise risk assessment, replay, and attestation remain
  separate controls; strict check does not silently execute all of them.
  Wire required controls into a mandatory orchestrator/CI path.
- Configured commands still run with user privileges. The check sandbox is not
  automatically a sandbox for the entire AI agent.

## Semantic deletion review

Standalone semantic diff includes tracked deleted files. Removing or emptying
a non-empty supported source file yields a critical `source-file-deleted`
finding requiring explicit review. Invalid Git comparison bases fail closed.
This conservative signal does not prove every deletion is a bug; unsupported
languages still require other checks.