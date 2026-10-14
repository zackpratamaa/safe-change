# Security policy

## Status

safe-change 0.3.x is actively maintained. This document describes the security boundaries, threat models, and operational invariants implemented in the system.

## Supported versions

| Version | Supported | Security Update Policy |
| :--- | :--- | :--- |
| `0.3.x` | Yes | Active patches and security fixes |
| `0.2.x` | Yes | Maintenance security fixes |
| `< 0.2.0` | No | Upgrade to latest release |

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

safe-change writes only to explicitly defined, isolated targets:
1. Core CLI operations (`save`):
   - `.safe-change/baseline.json`: the baseline state file.
   - Temporary staging files during atomic writes (immediately renamed or cleaned up).
2. Installer operations (`install`, `update`, `uninstall`):
   - Project scope: `<workspaceRoot>/.agents/skills/safe-change/` (including `SKILL.md` and `.safe-change-manifest.json`).
   - Global scope: `<homedir>/.gemini/config/skills/safe-change/` (strict allowlist under the user's home directory).
   - Temporary staging and rollback backup directories in system temporary storage (cleaned up upon completion or rollback).

safe-change never writes to `.git/` or any user source code files. By default, `safe-change init` does not modify `.gitignore`; `.gitignore` is only modified when the user explicitly passes the `--update-gitignore` flag.

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
- Process stdout/stderr is captured in bounded buffers for diagnostic display. safe-change does NOT perform automated secret or token detection; configured checks should avoid emitting sensitive credentials.

### Configuration trust model (`.safe-change.json`)

The `.safe-change.json` file defines the verification commands executed during `save` and `check`. While safe-change enforces non-shell process spawning (`child_process.spawn`) without shell expansion (preventing argument injection or shell chaining), **the commands themselves run with the full privileges of the executing user.**

**Threat Vector (Confused Deputy):** An attacker submitting a pull request could modify `.safe-change.json` to specify a harmful executable or script. If a reviewer executes `safe-change check` locally or in an unisolated CI environment without inspecting changes to `.safe-change.json`, that executable would run on their machine.

**Mitigation & Operational Rules:**
- Treat `.safe-change.json` with the exact same trust and scrutiny as a `Makefile`, `package.json` scripts, `build.gradle`, or CI workflow file.
- Never run `safe-change save` or `safe-change check` on untrusted repositories or pull requests before reviewing `.safe-change.json` changes.

### Dashboard HTTP server security architecture

safe-change includes an embedded local dashboard (`safe-change dashboard`) powered by Node.js's native `node:http` standard library. The server design adheres to strict defensive security constraints:

1. **Zero-Dependency Supply Chain Isolation:** Rather than importing large external web framework dependency trees (which introduce dependency confusion and supply chain attack surfaces), the server is built entirely with Node.js built-ins (`node:http`, `node:fs/promises`, `node:path`).
2. **Loopback Only (`127.0.0.1`):** The server explicitly binds to IPv4 loopback `127.0.0.1`. It is strictly unreachable from external network interfaces or local network peers.
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
- Local state writes use atomic temp-file-then-rename. Corrupted state produces an actionable error message.
- No source code, diagnostics, or telemetry is uploaded.
- No telemetry, cloud dependency, AI API key, or account is required.

## What safe-change cannot guarantee

A passing check only proves that the configured check completed successfully under its test conditions. It does not prove that every feature works, that deployment matches local behavior, or that the application is secure.

User-configured verification commands can themselves be destructive or communicate with external services. safe-change cannot make an unsafe user-provided command safe. Users should review configured commands and avoid running untrusted repositories or scripts.

A safe-change baseline is not a general-purpose backup. It stores hashes for comparison, not full file contents for restoration.

safe-change does not redact secrets, API keys, or sensitive credentials from process output or terminal displays. Ensure configured test commands do not print credentials.

## Dependency security policy

safe-change maintains strict separation between production dependencies and development tooling:

1. **Production Dependencies**:
   - Zero external runtime dependencies for core CLI, git inspection, comparator, rules engine, and local dashboard (powered by Node.js standard libraries).
   - Only standard MCP protocol SDK (`@modelcontextprotocol/sdk`) is included for the MCP server.
   - Any High or Critical CVE in production dependencies is an absolute release blocker.
   - Continuous gate: `npm audit --omit=dev --audit-level=high` runs on every CI commit and pull request.

2. **Development Tooling**:
   - Compilers (`typescript`, `napi-rs`), test runners (`vitest`), and coverage tools (`@vitest/coverage-v8`).
   - Automated dependency monitoring via Dependabot for monthly security patches.
   - Vitest, Vite, and Esbuild are pinned to patched, non-vulnerable versions.
   - No untrusted or arbitrary post-install scripts.

3. **Release Blockers**:
   - Any unaddressed High/Critical vulnerability in `npm audit`.
   - Broken version parity between root `package.json`, Cargo crate `Cargo.toml`, and platform packages.
   - Failed smoke test against the generated npm pack tarball.
   - Test coverage dropping below established thresholds.

## Release verification
 
The following security verifications are mandatory for all releases:
- Private vulnerability reporting configured.
- Package entry points, zero-dependency model, and publication file allowlists verified.
- Supported-versions policy defined and documented.
- Architecture validation for all native platform packages before npm publish.
- npm provenance enabled for cryptographic build attestation.
