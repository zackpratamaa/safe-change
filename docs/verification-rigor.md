# Verification rigor and reproducible limits

## Source coverage, not assurance

Run `npm ci`, `npm run build`, and `npm run test:coverage`. V8 produces `coverage/coverage-summary.json` using the committed `vitest.config.ts`. Existing thresholds and exclusions remain unchanged. Line, statement, function and branch percentages apply only to that selected source population, not every file in the repository.

After the main test matrix and tarball smoke test pass, CI publishes the Ubuntu measurement and exact source/run/config provenance to the report-only `coverage-reports` branch. SHA-scoped reports are retained under `reports/<source-sha>/`; the latest badge is a convenience pointer and can be cached or lag HEAD. Publication failure is a failed job, not a fabricated measurement. Pull request code cannot invoke the write-enabled publisher job. This is a public reporting mechanism, not third-party coverage validation.

## Labeled semantic corpus

Run `npm run test:semantic-corpus`. The script loads the actual built semantic engine and committed labels in `tests/fixtures/semantic-corpus/corpus.json`. It emits every observation, true/false positives/negatives, precision `TP/(TP+FP)` and recall `TP/(TP+FN)`; an empty denominator is null, not a perfect score. Unsupported fixtures or duplicate IDs fail rather than disappearing from the denominator.

These minimal examples model real classes of subtle code regression but are authored synthetic examples, not independently collected production incidents. The benign population includes formatting/comments, renames and key reordering. The regression population includes guard removal/inversion, swallowed errors, removed/weakened assertions, skipped tests, logical/comparison changes and removed nullish/optional access.

Same-count matcher weakening and removed await expressions are intentionally labeled regressions even when missed by the current heuristic. Those known misses are not relabeled benign or removed. Detection means at least one finding of any severity, not necessarily a blocking verdict, complete semantics, or production generalization. The corpus and labels should be reviewed and expanded as independently reproducible incidents arrive.

## Thirteen replay categories

Run `npm run test:replay-corpus` for the isolated runner-contract corpus; run `npm test` for the existing real-repository recorder/verification tests as well. The fixtures isolate repository, commit, configuration, policy, dependency, environment, command, output, exit status, artifact, secret-redaction, sandbox-capability and non-deterministic-result categories. Every fixture except checksum corruption recomputes the manifest digest so an unrelated checksum failure cannot satisfy it.

Capability snapshots describe the selected provider's observations, not independent proof that a policy was enforced. Missing legacy capability evidence is explicitly unverified. Declared artifact paths are hashed only as regular, singly linked workspace-relative files, rejecting traversal and symlinked ancestors. Only explicitly declared artifact hashes are compared; the recorder's default empty map does not discover all produced outputs. Equal-privilege concurrent ancestor replacement, manifest rewriting and external services remain outside this local observation boundary.

Metadata comparison without `--reexecute` does not execute commands. Reexecution is refused after preflight mismatches; a present npm lockfile's install failure propagates rather than being treated as a non-npm repository. Reexecution may use the network via package installation and configured checks and is not a hermetic/reproducible-build certification. Git identity here hashes the normalized origin, not an independently authenticated repository identity. A content checksum is not a signature, external timestamp, immutable log or authenticity proof.

The unit corpus controls external Git, executor and capability observations to independently reach each branch. It does not claim the controlled executor is a real cross-platform sandbox; actual CLI/native/sandbox workflows remain separate evidence. No independent cryptographic or security audit is implied.
