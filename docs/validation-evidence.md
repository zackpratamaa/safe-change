# Reading validation evidence

Source implementation, a passing local test, a PR check, a post-merge run, and an independent security review are different kinds of evidence. None should silently substitute for the others. The advanced layer remains Experimental; this page does not announce an independent review or general-availability certification.

## Reproducible commands

For a reviewed checkout with its declared dependencies installed:

```sh
npm ci
npm run lint
npm run build
npm run test:coverage
node scripts/sync-version.mjs --check
node scripts/smoke-test-tarball.mjs
```

These are commands to reproduce validation, not a promise that every environment or future commit passes. CI job logs/run conclusions provide evidence for one exact commit and environment. Native module execution and Java JDK matrices are separate workflows; a TypeScript test pass does not prove those targets.

## Observed post-merge CI snapshot

The lock-contention correction in [PR #27](https://github.com/zackpratamaa/safe-change/pull/27) merged as [`b01340d5abdc7a658c2dc6e77c3f68f45e65f941`](https://github.com/zackpratamaa/safe-change/commit/b01340d5abdc7a658c2dc6e77c3f68f45e65f941). The following new `main` workflow runs were directly inspected and completed successfully. They validate that commit, not subsequent edits to this page or the Phase 2 PR.

| Workflow | Post-merge evidence |
| :--- | :--- |
| CI: security/version gate, three OS coverage jobs and tarball smoke | [39487181657](https://github.com/zackpratamaa/safe-change/actions/runs/39487181657) |
| Four currently configured native targets | [39487181618](https://github.com/zackpratamaa/safe-change/actions/runs/39487181618) |
| Java JDK 17/21 across Linux, Windows and macOS | [39487181769](https://github.com/zackpratamaa/safe-change/actions/runs/39487181769) |
| Public package clean-install matrix | [39487181819](https://github.com/zackpratamaa/safe-change/actions/runs/39487181819) |
| Live Linux sandbox | [39487181847](https://github.com/zackpratamaa/safe-change/actions/runs/39487181847) |
| CodeQL | [39487181672](https://github.com/zackpratamaa/safe-change/actions/runs/39487181672) |

This snapshot does not assert that repository branch-protection settings were inspected, that an npm version was published, or that the project has no vulnerabilities.

## Incomplete or infrastructure-failed runs

**Cancelled, queued, skipped, and pending are not passing verification.** Do not remove an environment, weaken a test, add `continue-on-error`, or merge based only on successful siblings.

A concrete example is Phase 2's [Java run 39488828528](https://github.com/zackpratamaa/safe-change/actions/runs/39488828528): its macOS JDK 21 job was not acquired by a hosted runner after multiple attempts. GitHub reported an internal server error and macOS ARM capacity notices. Its five successful siblings do not make that job pass. Retain the incomplete run as evidence; any subsequent successful run must be linked separately to its own tested commit.

For a runner allocation failure, rerunning the affected job (where access permits), or validating the next actual code/documentation revision, can provide new evidence. It does not repair or retroactively change the earlier run. Repeated test failures are different: investigate the code, isolation, timing or assertion behavior and commit a regression test rather than treating repeated reruns as a fix.
