# Getting started and readiness boundaries

safe-change records verification results before a change and helps detect regressions afterward. It does not make an untested project safe, replace backups, or guarantee that AI edits are correct.

## Use the right version

This guide describes the current source increment. The repository is still versioned as a preview. Newly merged source features are not automatically available from the npm registry. Check the installed version and the corresponding release notes before expecting `doctor` or the packaged Java helper to exist.

Use a maintained Node.js LTS release (Node 22 or 24 is recommended), npm and Git. Java is optional and requires a full JDK 17 or newer only when the Java compilation helper is configured. Native binaries are optional; the TypeScript fallback is independently tested.

For a published version that includes these features:

```sh
npm install --save-dev safe-change
npx safe-change --version
npx safe-change doctor
```

To try unreleased source, clone this repository, run `npm ci`, then `npm run build` and `node dist/cli.js doctor`. A local build is not a published stable release.

## First project workflow

Run these commands from the Git repository you want to protect:

```sh
npx safe-change init --update-gitignore
```

Review `.safe-change.json`. Confirm that its commands actually build or test your project and that running them is appropriate. Init detects common runners; it is not proof that the generated checks are meaningful. A configuration with no checks only tracks files and must not be treated as verified behavior.

The explicit `--update-gitignore` option adds `.safe-change/` when necessary. Without that option, init leaves `.gitignore` unchanged. Git's actual ignore rules are consulted, so comments and lookalike paths do not count. Already tracked state is a separate problem; adding an ignore rule does not remove it from the index or history.

```sh
npx safe-change doctor
npx safe-change save "before the change"
# Make the intended source change.
npx safe-change check --strict
npx safe-change diff --stat
```

If a check fails before you save the baseline, repair or understand that failure first. After a regression, fix the implementation and compare against the original accepted baseline. Do not rewrite the check or save a new baseline merely to make the result green.

`--strict` is important for automation: unavailable or unverified results must not be mistaken for a passing verification.

## Diagnose without running project checks

```sh
npx safe-change doctor --json
```

Doctor inspects runtime/tool availability, Git repository discovery, configuration, existing baseline readability, effective state-file ignore rules and host sandbox capability reports. It does not install dependencies, run configured project commands, edit repository files, create a baseline or certify existing verification freshness. Host sandbox detection may run bounded platform probes using temporary directories outside the repository.

- JSON uses schema version 1 and scope `local-readiness`.
- `pass` means the individual inspection succeeded, not that the application is correct.
- `warn` gives a next step; warnings alone return exit 0.
- `error` blocks readiness and returns exit 1.
- A missing baseline is a warning; a corrupt baseline is an error.
- Missing OS isolation is a warning unless the configured policy requires network denial, in which case it is an error.
- An executable being present does not confirm its dependencies, full JDK availability or successful execution.
- Configured executable arguments and raw configuration content are not included in the diagnostic report.

Use `safe-change check --strict` for actual verification, not doctor output.

## Java projects

See [Java compilation verification](java-verification.md). The optional helper now ships inside the npm tarball at `tools/java/JavaSourceCheck.java`. It only verifies compilation of Java-17-compatible, JDK-only source trees. Projects using framework plugins, external libraries, generated code or annotation processing should retain their real Maven/Gradle build and test commands.

On Windows, batch files such as `mvn.cmd` and `gradlew.bat` are not native executables for the shell-free check runner. Configure a supported native executable or an explicitly reviewed interpreter-based command; do not assume Unix wrappers work unchanged.

## What is and is not validated

CI verifies the core suite with coverage on Linux, Windows and macOS, native build/load checks on four platform targets, actual Linux namespace isolation on a dedicated host, Java regression fixtures, and clean npm tarball installations on Linux/Windows/macOS under Node 22 and 24. The clean-install scenario exercises the TypeScript fallback, CLI, doctor, strict regression detection, generic stdio MCP and the packaged Java helper.

This is fixture-scoped evidence, not certification of every project or environment. Installing agent skill files does not guarantee that an IDE loads them, starts a watcher or enforces a user's consent decision. Task sessions and IDE hook integrations remain experimental where their documentation says so. macOS and Windows providers must not be presented as Linux-equivalent OS isolation.

Before a stable public release, verify release/version parity, production dependency audits, package contents, native artifact availability, release credentials/provenance, supported runtime policy and release notes. Do not relabel a preview as stable or publish merely because a test matrix is green. Never commit `.safe-change` state or secrets to make a CI result easier to reproduce.
