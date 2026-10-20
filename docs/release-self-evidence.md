# Release self-evidence, not external assurance

The release-internal `scripts/release-evidence.mjs` runs the existing CLI on its own checkout:

```sh
node dist/cli.js save "Release self-check <actual checked-out SHA>" --json
node dist/cli.js check --strict --json
node dist/cli.js evidence "release-<actual checked-out SHA>" --json
```

The script obtains the actual SHA from Git, requires matching GitHub run provenance, uses the committed `.safe-change.json` unchanged, and does not manufacture a verification summary. Every configured command must produce unblocked `pass-pass` evidence with zero exit, no timeout and no detected secret types. A failed command, stale/missing verification, changed source, baseline mismatch or invalid component checksum prevents a verified archive. The baseline and check rerun the configured commands; this is not a simulation that labels earlier workflow steps as CLI verification.

## Files and independent byte checking

On successful generation, the Ubuntu CI job uploads artifact `release-evidence-bundle` containing:
- `release-evidence.tar.gz`
- `release-evidence.tar.gz.sha256`

The archive contains only the four CLI evidence components, `manifest.json`, `checksums.txt` and `provenance.json`. It does not copy the state directory wholesale, command stdout, source contents, keys or arbitrary extra files. Provenance records the source SHA, actual run URL, package version, configuration hash, configured check names and evidence digest. The archive checksum covers provenance too; the original CLI `checksums.txt` covers its five JSON files.

After downloading both files to a disposable directory:

```sh
sha256sum -c release-evidence.tar.gz.sha256
tar -xzf release-evidence.tar.gz
(cd release-evidence && sha256sum -c checksums.txt)
```

Inspect `provenance.json`, `manifest.json`, `baseline-summary.json` and `verification-report.json`. Compare the reported SHA/run with the GitHub run and release tag before relying on them. Digests detect inconsistent bytes relative to the supplied checksums; an attacker who can replace the archive and checksum together can forge that consistency. These artifacts are not signed DSSE attestations, independently trusted time stamps or proof of an untampered build service.

For a local self-check, install/build the source at the desired commit, then run the three CLI commands above with `git rev-parse HEAD` substituted for the placeholder. `npm run test:coverage` and the other configured checks must really run and pass. Archive packaging itself expects GitHub CI variables so a local run is not mislabeled as a hosted run.

## Release integration and honest completion criteria

The existing release `build-root` job generates the same evidence and uploads the separate artifact. The tag-push-only `publish-root` path downloads it, validates its archive checksum and includes both files in **both** preview and non-preview GitHub release attachment commands. Manual dispatch remains non-publishing and validates the downloaded archive too. Missing evidence fails the job; no `continue-on-error`, ignored exit, new skip, lower assertion or relaxed check timeout is added.

This wiring does not mean a release has happened. CI artifact generation must be observed in an actual green run; next-release attachment remains pending until a genuine tag release runs successfully and both assets can be downloaded and checked. Do not create an artificial version/tag or bypass production-environment approval merely to call this phase complete.

A successful self-check is bounded to the configured checks and this workspace. It does not establish all-platform release certification, functional completeness, third-party security review, or protection against an equal-privilege actor. See the [draft independent review brief](external-security-review-brief.md) and the authoritative [threat model](../SECURITY.md#threat-model).

Regression entry point: `tests/unit/release-evidence.test.ts`; release command execution is separately exercised by the Ubuntu CI step, not claimed from the unit fixtures alone.
