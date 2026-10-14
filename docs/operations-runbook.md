# Operations Runbook

## 1. Health verification

Run the following from the repository root:

```bash
safe-change status --json
safe-change check --strict --json
```

Require verification.state verified and strict exit zero. Inspect protected oracle drift/input mutation as well as check failures, rules, and environment. Review oracle changes before explicitly accepting a new baseline; never rebaseline simply to silence a regression. Regenerate evidence after a fresh check.

## 2. Installation failure

1. Confirm Node.js satisfies the version requirement in `package.json`.
2. Confirm the installed `safe-change` version matches the approved version.
3. Retry installation without optional dependencies to isolate native package resolution.
4. Set `SAFE_CHANGE_NATIVE_DISABLED=1` and verify the TypeScript fallback.
5. Do not bypass package integrity, TLS, or registry verification.

## 3. Verification timeout

1. Identify the timed-out check in JSON output.
2. Run the underlying command directly in the same repository and environment.
3. Determine whether the command is hung, under-provisioned, or configured with an unrealistic timeout.
4. Review timeout changes through the normal pull-request process.
5. Never convert a required failing check into a warning solely to make a rollout pass.

## 4. Unexpected verification result

1. Stop accepting AI-generated changes in the affected repository.
2. Preserve the baseline, `.safe-change.json`, command output, package version, and operating-system details.
3. Compare behavior with `SAFE_CHANGE_NATIVE_DISABLED=1`.
4. Reproduce in a disposable clone.
5. Report correctness defects without including proprietary source code.

## 5. Native module incident

Containment:

```bash
export SAFE_CHANGE_NATIVE_DISABLED=1
```

On Windows PowerShell:

```powershell
$env:SAFE_CHANGE_NATIVE_DISABLED = "1"
```

Re-run the verification suite. If fallback behavior is correct, continue in fallback mode while the native package is investigated.

## 6. Rollback

1. Stop the rollout ring.
2. Pin the previous approved version.
3. Reinstall from the trusted registry.
4. Verify package integrity and provenance.
5. Run `safe-change status`, `save`, and `check` in a disposable repository before restoring normal use.
6. Document the reason, affected versions, repositories, and resolution.

Do not delete user baselines as part of a routine package rollback.

## 7. Security incident

For suspected repository escape, credential exposure, malicious package behavior, or release compromise:

1. Stop installation and execution.
2. Revoke affected credentials and npm tokens.
3. Preserve workflow logs and artifact digests.
4. Disable the affected release or agent path.
5. Use GitHub private vulnerability reporting as documented in [../SECURITY.md](../SECURITY.md).
6. Publish a patched version rather than attempting to overwrite an immutable npm version.

## 8. Release recovery

- If no package was published, fix the issue and create a new validated tag only when the existing tag has not been used for publication.
- If every native package is published but the root package is not, rerun the original tag workflow. Preflight enters `root-recovery` mode and skips immutable native packages.
- If only part of the native matrix is published, stop. The release is in an unsafe mixed state and requires maintainer review before a new patch version is prepared.
- If the root package is already published, the release is complete and immutable.

Manual workflow dispatch is dry-run only and cannot publish.

## 9. Evidence to retain

- Package version and npm integrity/provenance information.
- Git commit and release tag.
- GitHub Actions run URLs.
- Artifact SHA-256 values.
- Relevant `safe-change` JSON output with secrets removed.
- Rollout ring, affected repositories, and operator decisions.
