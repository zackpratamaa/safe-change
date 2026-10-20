# Security policy

## Status

This source tree is **1.1.0-preview.1 — Experimental developer preview**, not a general-availability security certification. The version is declared in [package.json](package.json). No independent security review or soak/stabilization period is asserted by this document.

## Threat Model

**Equal-privilege actors are out of scope.** An agent or human with the same OS-user filesystem permissions as safe-change can read, modify, replace, or delete `.safe-change/`, including the audit log and baseline. They can rebuild a self-consistent digest chain. safe-change is a safety net for honest mistakes, not a sandbox against an actor with equal privileges. Local hashes, leases, and signatures whose trust root is also locally replaceable do not change that boundary.

### In scope and assumptions

- Regressions introduced by a well-behaved agent, to the extent the configured checks and guardrails can observe them. A passing test does not prove absence of regressions.
- Accidental baseline corruption and retained-state modifications that violate the validated schema, recorded hashes, or digest links. There is no authenticated historical baseline simply because a JSON file is well formed.
- Race conditions between cooperative sessions: the **write lease** coordinates cooperating writers; **workspace fingerprints** compare selected environment/configuration inputs. The safety-log state lock serializes its read/modify/write operations. These are distinct mechanisms, not a filesystem-wide lock or an atomic transaction over all state files.
- Reviewed configuration, trusted check executables, and operating-system permissions appropriate for local development. Checks run as the invoking user; they may modify files or use the network.

### Controls and explicit non-guarantees

| Control | What it detects or coordinates | What it cannot detect or prevent |
| :--- | :--- | :--- |
| Write lease | A cooperating acquisition rejects a different session's unexpired recorded lease; malformed recorded lease data can be rejected. See [lease implementation](src/integrity/lease.ts) and [lease tests](tests/unit/integrity-core.test.ts). | It cannot prevent direct writes, deletion/replacement of the lease, or non-cooperating processes; it is not an OS sandbox or a universal multi-file transaction. |
| Workspace fingerprint | Comparison reports changes in the recorded HEAD/branch/remote hash, selected configuration/rules/skill, discovered supported lockfiles, policy version, agent label, and runtime fields. See [fingerprint implementation](src/integrity/fingerprint.ts). | It is not a full source-tree snapshot, exhaustive dependency inventory, or authenticated reference; lockfile discovery excludes build/state directories and is depth-limited. Source binding is a separate [verification mechanism](src/integrity/verification-binding.ts). |
| Evidence bundle | The manifest/checksums allow a consumer to compare recorded component bytes; creation downgrades missing/stale verification bindings rather than treating them as fresh. See [evidence implementation](src/integrity/evidence.ts) and [binding tests](tests/unit/verification-hardening.test.ts). | Creation does not independently re-verify a later-modified bundle. Replacing the bundle and all its checksums, or forging the locally stored inputs, cannot be detected without an independently trusted reference. It is not a source backup. |
| `audit verify` | Validation checks the retained events' schema, sequence, previous-digest links, and event digests. See [audit implementation](src/integrity/audit-log.ts) and [retained-state corruption tests](tests/unit/audit-tampering.test.ts). | A consistent prefix after tail truncation, complete deletion, or a fully rebuilt chain is not distinguishable from legitimate history without a separately trusted head/count. An empty/missing log is not proof that no events ever existed. Payload digests do not reconstruct omitted payloads. |
| `policy verify` | It checks the policy digest and Ed25519 signature against the public key supplied in the signature object. See [signature implementation](src/enforcement/policy-signature.ts) and [command acceptance logic](src/commands/policy.ts). | It does not independently pin that key to an organization, prevent an equal-privilege replacement of policy plus key, or prove policy safety. When `requireSignedPolicy` is false, the command may exit successfully with `valid: false`; inspect `valid`, `required`, and `accepted`, not exit status alone. |

### Interpreting corruption and missing evidence

Tests in [audit-tampering.test.ts](tests/unit/audit-tampering.test.ts) exercise retained-event edits, reordered/malformed entries, and command failure reporting. Tests in [state-tampering-check.test.ts](tests/integration/state-tampering-check.test.ts) exercise damaged baseline/rules state through the `check` command contract. The audit tests also preserve an explicit counterexample: a consistent truncated prefix or deleted log has no local historical witness. These tests bound the claims; they do not establish hostile same-user isolation or a completed third-party review.

## Supported versions

| Version | Supported | Security Update Policy |
| :--- | :--- | :--- |
| `1.1.0-preview.1` | Experimental preview | Source hardening and preview fixes; not a GA support promise |

This table describes the current source snapshot, not the npm `latest` channel. Historical release entries do not establish a current maintenance promise for older series.

## Reporting a vulnerability

To report a vulnerability, use GitHub private vulnerability reporting:
https://github.com/zackpratamaa/safe-change/security/advisories/new
This feature must be enabled by the repository owner before this link works.
See: https://github.com/zackpratamaa/safe-change/settings/security_analysis

Until a private reporting channel exists, do not disclose exploit details, tokens, private files, or proof-of-concept code in a public issue. Contact the maintainer through a private channel you already trust. Maintainers should acknowledge reports, coordinate a fix and disclosure with the reporter, and avoid promising response times they cannot meet.

**Release blocker:** Private vulnerability reporting must be enabled by the repository owner before the npm package is published.

### Release pipeline security and provenance

Production releases follow strict security controls:
- **Build Provenance**: The approved tag publication pipeline requests OIDC-backed npm provenance (`--provenance`). Verify provenance for the exact artifact/version; source workflow configuration alone does not prove every historical publication has it.
- **Credential Hygiene**: CI release runners access registry credentials solely via ephemeral secrets injected at publication time. Publication scripts actively sanitize diagnostic errors to prevent token disclosure.
- **Workflow Permissions**: Release workflow defaults use `contents: read` and `id-token: write`; the GitHub release publication job explicitly requires `contents: write`. Review job-level scopes, not only workflow defaults.
- **Preflight Gate**: Release orchestrator scripts require automated preflight validation to verify version parity, package existence status, and release tag authenticity before granting build and publish permissions.

## Trust boundaries

### What safe-change accesses

safe-change runs on a developer's machine with access to a Git working tree. It reads repository files, Git metadata, and executes verification commands that the user explicitly configures in `.safe-change.json`.

### Repository read boundary and symlinks

safe-change operates strictly within the working tree of the Git repository. When encountering symbolic links inside the repository, safe-change uses `lstat` and `readlink` to inspect only the link target path string itself. It never traverses or opens target files located outside the repository root. This ensures that symlinks cannot be used to escape the repository read boundary or expose external filesystem content into baseline data. Broken symlinks or symlinks pointing to directories are hashed by their link target string without traversing.

Platform note: On Windows systems, creation of symbolic links in tests or development may require elevated administrator privileges or Developer Mode enabled in Windows Settings.

### What safe-change writes

Core commands write local state under `.safe-change/`, including the baseline, safety log/lock, rules, verification summaries, sessions, leases, audit events, identities/approvals, signing material when explicitly requested, and evidence/replay/attestation artifacts. This is not a universal allowlist for user-configured programs.

1. Baseline storage (`save`):
   - `.safe-change/baseline.json`: the baseline state file.
   - Temporary staging files during atomic baseline writes (renamed or cleaned up).
2. Installer operations (`install`, `update`, `uninstall`):
   - Project scope: `<workspaceRoot>/.agents/skills/safe-change/` (including `SKILL.md` and `.safe-change-manifest.json`).
   - Global scope: `<homedir>/.gemini/config/skills/safe-change/` (strict allowlist under the user's home directory).
   - Temporary staging and rollback backup directories in system temporary storage (cleaned up upon completion or rollback).

The core save/check/diff implementation does not intentionally rewrite source or Git history; configured programs execute separately with the user’s privileges. By default, `safe-change init` does not modify `.gitignore`; `.gitignore` is only modified when the user explicitly passes the `--update-gitignore` flag.

### Process execution and tree termination

Verification commands are spawned directly via `child_process.spawn` without a shell. The executable and arguments are taken from the configuration file's explicit `executable` and `args` fields. No shell interpretation occurs.

Each command runs with:
- A configurable timeout (default 60 seconds, maximum 3600 seconds).
- Bounded ring-buffer tail capture (default 100 KB per stream, 8 KB diagnostic tail) with UTF-8 multibyte boundary alignment.
- No stdin (stdin is set to `ignore`).
- Whole-process-tree termination on timeout (`terminateProcessTree`): On POSIX, processes run in isolated process groups and are signaled with `SIGTERM` followed by `SIGKILL`. On Windows, `taskkill /pid <pid> /T /F` terminates the root process and all descendant processes, preventing orphaned child processes.
- Explicit timeout timers that accurately distinguish between execution timeouts and external process termination signals.

### Data treatment

- Repository content, file paths, Git output, process output, and any agent-produced text are treated as untrusted data.
- Terminal output sanitizes control characters (stripping non-printable control characters except newline, carriage return, and tab) to mitigate terminal escape injection.
- JSON output uses standard serialization without executing embedded content.
- Baseline files store file hashes (sha256), not file contents. This privacy-preserving design minimizes disk footprint and prevents accidental leakage of secrets or source code into tool state.
- Process stdout/stderr is captured in bounded buffers for diagnostic display. configured checks must avoid emitting sensitive credentials. Do not rely on output filtering as complete secret detection or data-loss prevention.

### Configuration trust model (`.safe-change.json`)

The `.safe-change.json` file defines the verification commands executed during `save` and `check`. While safe-change enforces non-shell process spawning (`child_process.spawn`) without shell expansion (preventing argument injection or shell chaining), **the commands themselves run with the full privileges of the executing user.**

**Threat Vector (Confused Deputy):** An attacker submitting a pull request could modify `.safe-change.json` to specify a harmful executable or script. If a reviewer executes `safe-change check` locally or in an unisolated CI environment without inspecting changes to `.safe-change.json`, that executable would run on their machine.

**Mitigation & Operational Rules:**
- Treat `.safe-change.json` with the exact same trust and scrutiny as a `Makefile`, `package.json` scripts, `build.gradle`, or CI workflow file.
- Never run `safe-change save` or `safe-change check` on untrusted repositories or pull requests before reviewing `.safe-change.json` changes.

### Dashboard HTTP server security architecture

safe-change includes an embedded local dashboard (`safe-change dashboard`) powered by Node.js's native `node:http` standard library. The server design adheres to strict defensive security constraints:

1. **HTTP implementation:** The server uses Node.js `node:http`, rather than an external HTTP framework. The package still has runtime dependencies declared in `package.json`; this is not a zero-dependency supply-chain guarantee.
2. **Local status API:** All dashboard endpoints bind to `127.0.0.1` only and their handlers do not initiate external network uploads. See `LOCALHOST_HOST` and `startDashboardServer` in [src/dashboard/server.ts](src/dashboard/server.ts), plus the runtime test `binds only to 127.0.0.1` in [tests/unit/dashboard-server.test.ts](tests/unit/dashboard-server.test.ts). This is a loopback listener, not local-user authentication or a guarantee against reverse proxies/port forwarding. Configured checks and programs launched by the user can independently access external networks.
3. **Fixed Route Allowlist:** Only 10 static endpoints are served (`/`, `/api/status`, `/api/log`, `/api/config`, `/api/rules`, `/api/enterprise`, `/api/lease`, `/api/audit`, `/api/identity`, `/api/verifiable`). Any other path immediately returns a 404 response.
4. **No Path Traversal or Arbitrary File Serving:** The dashboard does not accept file paths as query parameters or URL path components. All returned JSON data is assembled in-memory from validated internal data structures, and the HTML template is rendered entirely from an embedded in-memory string. No dynamic disk file-serving logic exists.
5. **Strict Method Restriction:** The server only accepts `GET` requests. Any `POST`, `PUT`, `DELETE`, or other HTTP method is immediately rejected with `405 Method Not Allowed`.

## Installer security model

The safe-change installer manages agent skills under rigorous security boundaries.

### Scope isolation and path safety

- **Project Scope**: Confined strictly inside the Git repository workspace root (`<workspaceRoot>/.agents/skills/safe-change/`). Path resolution normalizes and canonicalizes all paths. Relative path traversals (`..`), drive letter escapes on Windows, and root escapes on POSIX systems are strictly blocked.
- **Global Scope**: Confined strictly to an explicit allowlist of authorized agent skill directories within the user's home directory:
  - Antigravity: `<homedir>/.gemini/config/skills/safe-change/`
  - Claude Code: `<homedir>/.claude/skills/safe-change/`
  - Cursor: `<homedir>/.cursor/skills/safe-change/`
  - OpenAI Codex: `<homedir>/.codex/skills/safe-change/`
  - Cline: `<homedir>/.cline/skills/safe-change/`
  - Kimi Code: `<homedir>/.kimi-code/skills/safe-change/`
  - Amp: `<homedir>/.config/agents/skills/safe-change/`
  - OpenCode: `<homedir>/.config/opencode/skills/safe-change/`
  - Gemini CLI: `<homedir>/.gemini/skills/safe-change/`
  - GitHub Copilot: `<homedir>/.github/skills/safe-change/`
  Absolute paths outside the allowlist, root paths (`/` or `C:\`), and sensitive directories (`~/.ssh`, `~/.bashrc`, or system folders) are strictly rejected.
- **Symlink and Junction Defense**: Both target directories and canonical source files are inspected with `lstat`. Any symbolic link or Windows directory junction is rejected with exit code 9 (`INCOMPATIBLE_TARGET`) to prevent directory traversal attacks or symlink swapping.

### Ownership markers and integrity manifests

- Every safe-change installation writes an ownership manifest (`.safe-change-manifest.json`).
- The manifest records the package version, owning agent (`antigravity`), target scope, installation timestamp, and SHA-256 digests of all installed files.
- Before `update` or `uninstall`, safe-change verifies:
  1. The target directory contains a valid manifest owned by `safe-change`.
  2. The owning agent matches the invoked adapter.
  3. No untracked foreign files exist in the target directory. If foreign files are detected, uninstallation aborts with exit code 7 to prevent accidental deletion of user data.

### TOCTOU (Time-of-Check to Time-of-Use) mitigation and limitations

- **Mitigation**: The installer performs post-installation integrity checks by reading back the installed files immediately after commit, verifying that the installed SHA-256 matches the canonical source SHA-256. Staged writes use isolated temporary directories before moving files into place.
- **Limitations**: In environments with concurrent local processes or hostile local actors sharing the same filesystem account, a race condition could theoretically exist between path inspection and directory creation/rename. Because standard OS filesystems do not support atomic multi-path cross-directory replacement without specialized kernel locking, absolute immunity against concurrent local root/admin interference is not possible. safe-change assumes single-user or cooperative local execution.

### Rollback mechanism and limitations

- **Mechanism**: Before writing or modifying the target directory, the installer creates a complete backup in a private temporary directory (`safe-change-backup-*`). If any step fails during staging, write, or integrity verification, the transaction is aborted, the backup is restored to the target path, and temporary files are cleaned up.
- **Limitations**: Rollback protects against internal transaction failures, hash mismatches, and interrupted copy operations within the process. It cannot recover from sudden hard power cuts, OS kernel panics, or external deletion of the temporary backup directory during the operation.

## Implemented safety properties

- `save`, `check`, and `diff` do not commit, stash, reset, clean, delete, or overwrite user files. This is verified by the integration test suite.
- Reading a baseline and rendering a report does not execute repository-provided instructions.
- Verification uses an explicit allowlist of user-configured commands with a documented execution model. No implicit execution of arbitrary package scripts.
- Process execution has timeouts, output bounds, and clean termination behavior.
- Baseline and safety-log storage use guarded atomic replacement; this is not a claim that every advanced subsystem uses an atomic multi-file transaction. Invalid retained baseline/rules/audit data is exercised by the corruption tests named in the Threat Model.
- No source code, diagnostics, or telemetry is uploaded.
- No telemetry, cloud dependency, AI API key, or account is required.

## What safe-change cannot guarantee

A passing check only proves that the configured check completed successfully under its test conditions. It does not prove that every feature works, that deployment matches local behavior, or that the application is secure.

User-configured verification commands can themselves be destructive or communicate with external services. safe-change cannot make an unsafe user-provided command safe. Users should review configured commands and avoid running untrusted repositories or scripts.

A safe-change baseline is not a general-purpose backup. It stores hashes for comparison, not full file contents for restoration.

Output filtering is not a complete confidentiality boundary. Ensure configured test commands do not print credentials; exposed real credentials require rotation regardless of filtering.

## Dependency security policy

safe-change maintains strict separation between production dependencies and development tooling:

1. **Production Dependencies**:
   - Root runtime dependencies include `@modelcontextprotocol/sdk` and `typescript`; optional platform-native packages are declared separately. Consult the exact root manifest and lockfile rather than assuming a zero-dependency CLI.
   - Any High or Critical CVE in production dependencies is an absolute release blocker.
   - Continuous gate: `npm audit --omit=dev --audit-level=high` runs on every CI commit and pull request.

2. **Development Tooling**:
   - Native build tooling (`@napi-rs/cli`), test runners (`vitest`), coverage tools (`@vitest/coverage-v8`), and Node type declarations; TypeScript is also a runtime dependency.
   - Automated dependency monitoring via Dependabot for monthly security patches.
   - Dependency audit results are specific to the lockfile, advisory database, and actual run; they are not proof that dependencies have no vulnerabilities.
   - No untrusted or arbitrary post-install scripts.

3. **Release Blockers**:
   - Any unaddressed High/Critical vulnerability in `npm audit`.
   - Broken version parity between root `package.json`, Cargo crate `Cargo.toml`, and platform packages.
   - Failed smoke test against the generated npm pack tarball.
   - Test coverage dropping below established thresholds.

## Release verification
 
The following security verifications are mandatory for all releases:
- Private vulnerability reporting configured.
- Package entry points, declared runtime dependency inventory, and publication file allowlists verified.
- Supported-versions policy defined and documented.
- Architecture validation for all native platform packages before npm publish.
- npm provenance enabled for cryptographic build attestation.
