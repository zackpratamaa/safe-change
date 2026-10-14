# Installer Architecture and Lifecycle Specification

> Historical design snapshot for Milestone C.2, not the current installer implementation. For current operation use [GUIDE.md](../GUIDE.md) and [runtime evidence](runtime-verification.md). Earlier not-implemented statements below refer to that milestone.

This document defines the architectural specification, safety model, lifecycle state machine, and path boundary policies for the proposed `safe-change` installer.

Verified Baseline Commit:
`06f0b37f90d7c490bcdeb8ddcaf956e76e25b314`

Current Status:
Architecture design phase (Milestone C.2). No production installer code, CLI commands (`safe-change install`, `safe-change update`, `safe-change uninstall`), interactive prompts, or plugin manifests are implemented in this milestone. Production implementation remains blocked until this architecture undergoes formal review.

---

## Terminology and Verification Levels

To prevent misleading claims regarding implementation maturity, the following terms are used with precise meanings throughout this document:

- **must**: A mandatory requirement that any future production implementation is required to enforce.
- **designed to**: An architectural goal or planned behavior of the proposed system that is not yet implemented in production code.
- **validated**: Behavior proven and enforced by an existing, passing test suite (e.g., the isolated filesystem fixture in `tests/integration/antigravity-fixture.test.ts`).
- **not yet validated**: Behavior specified in this architecture but not yet implemented or tested in code.
- **runtime unverified**: Behavior documented or inferred from agent specifications that has not been executed or confirmed in a real, live agent runtime session.

---

## Mandatory Safety Rules

The installer architecture specifies the following mandatory invariant rules that any future implementation must enforce across all platforms and execution contexts:

1. **No Silent Git Modification**: The installer must never silently modify `.gitignore`, `.git/info/exclude`, or any other Git tracking configuration. Any exclusion advice must be explicitly displayed to the user as actionable guidance.
2. **No Unapproved Overwrites**: The installer must never overwrite user-owned files, pre-existing configuration, or unknown skill files without explicit user approval.
3. **Strict Symlink and Junction Defense**: The installer must never create, traverse, or follow unexpected symbolic links, junction points, or hard links.
4. **Strict Scope Boundary**: The installer must never write outside the user-selected scope (workspace root or explicitly authorized global configuration directory).
5. **Instruction File Protection**: The installer must never modify `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, or equivalent instruction files without a documented, reviewed merge and collision policy.
6. **Fixture vs Runtime Distinction**: A filesystem fixture does not prove runtime agent discovery. Runtime discovery must be independently verified on live agent versions before claiming runtime support.
7. **Format vs Compatibility Distinction**: A matching file format (e.g. YAML frontmatter in Markdown) does not prove runtime plugin compatibility or runtime invocation capability.
8. **No Guessing of Unsupported Formats**: Unsupported or undocumented agent formats must not be guessed, assumed, or approximated.
9. **Single Source of Truth**: The canonical skill at `skills/safe-change/SKILL.md` is the only source of truth for skill content and instruction contracts.
10. **Separate Plugin Directories**: Agent plugin folders must remain strictly separate to avoid cross-contamination of vendor-specific manifests and configurations.
11. **Architecture Review Prerequisite**: Production code implementation begins only after this architecture specification is reviewed and approved.

---

## 1. Purpose and Boundaries of the Installer

The primary purpose of the planned `safe-change` installer is to place the canonical Agent Skill and necessary agent adapter configurations into target environments with a design goal of minimizing unintended side effects, using atomic operations where supported, and tracking file ownership explicitly.

### What the Planned Installer Is Designed To Be
- A local-first utility designed to distribute the canonical skill instructions to supported AI coding agent configuration directories (not yet validated in production code).
- A lifecycle manager designed to provide deterministic installation, status checking, updating, uninstallation, and rollback once implemented (not yet validated in production code).
- A safety barrier designed to verify path boundaries, filesystem types, and collision states before writing to disk (filesystem mechanics validated only in test fixture; not yet validated in a production CLI).

### What the Installer Is Not
- It is not an arbitrary package manager, system daemon, or auto-updater.
- It is not a cloud service, telemetry collector, or remote registry client.
- It does not modify system binaries, PATH environment variables, or global shell initialization scripts (`.bashrc`, `.zshrc`, PowerShell profiles).
- It does not automatically run Git commits, Git pushes, or staging operations on user repositories.

---

## 2. Project/Workspace Scope vs Global Scope

The architecture defines two distinct installation scopes, each with strict isolation, explicit targeting rules, and different lifecycle implications:

| Dimension | Workspace / Project Scope | Global / User Scope |
| --- | --- | --- |
| **Definition** | The user-selected project or repository root directory | Dedicated, vendor-specific user profile configuration directory |
| **Selection Requirement** | Explicitly selected via current working directory (CWD) or `--workspace <path>` | Requires explicit `--scope global` flag and interactive confirmation |
| **Target Location** | Inside project repository (e.g., `<projectRoot>/.agents/skills/safe-change/`) | Inside allowlisted agent config (e.g., `~/.gemini/config/skills/safe-change/`) |
| **Allowlist Policy** | Confined strictly within the boundaries of the selected workspace root | Confined strictly to a pre-approved, documented vendor allowlist |
| **Normal Location** | May legitimately reside inside user home subpaths (e.g. `~/projects/app`, `Documents/repo`) | Restricted to specific config subtrees; never arbitrary home subpaths |
| **Team Sharing** | Can be committed to version control to share safety baselines across team members | Applies only to the local machine and current user session |
| **Precedence** | Takes precedence over global installations in hierarchical discovery agents | Acts as fallback when project-level skill is absent |
| **Default Mode** | Default scope for all operations | Opt-in only; never selected implicitly |

---

## 3. Agent Compatibility Status

Compatibility across target coding agents is categorized using conservative, evidence-based classifications:

### Antigravity (Google DeepMind)
- **Status**: Candidate for first integration.
- **Evidence Level**: Filesystem fixture validated in test suite (`tests/integration/antigravity-fixture.test.ts`).
- **Limitation**: Runtime discovery has not been independently verified on public runtime releases (runtime unverified).

### Claude Code (Anthropic)
- **Status**: Partially verified.
- **Evidence Level**: Official documentation verified for slash commands, prompt injection, and memory files (`CLAUDE.md`).
- **Limitation**: Skill precedence, directory shadowing, and multi-scope interaction require caution. Dedicated skill directory discovery is not officially stabilized (runtime unverified).

### Cursor (Anysphere)
- **Status**: Partially verified.
- **Evidence Level**: `.cursor/rules/*.mdc` is the documented, official primary format.
- **Limitation**: `.cursor/skills/` remains unverified and unsupported unless officially documented by Cursor (runtime unverified).

### Codex (OpenAI)
- **Status**: Partially verified.
- **Evidence Level**: `AGENTS.md` is the officially documented mechanism for repository instruction injection.
- **Limitation**: Dedicated `.codex/skills/` and `~/.codex/skills/` directories are unverified and undocumented (runtime unverified).

### Other Agents (Cline, Kimi Code, Amp, OpenCode, Gemini CLI, etc.)
- **Status**: Not researched or not verified.
- **Policy**: No installation targets or adapters will be offered or inferred for these agents until official documentation and validation fixtures exist.

---

## 4. Separate Plugin Folder Structure per Agent

To prevent cross-agent configuration conflicts, vendor-specific plugin adapters will reside in isolated subdirectories under `plugins/`.

### Proposed Repository Layout

```
skills/
└── safe-change/
    └── SKILL.md

plugins/
├── antigravity/
├── claude-code/
├── cursor/
├── codex/
├── cline/
├── kimi-code/
├── amp/
├── opencode/
└── gemini-cli/
```

### Evaluation and Implementation Rule
- **Current State**: None of the subdirectories under `plugins/` will be created at this time. Creating empty or placeholder directories violates repository hygiene and misleads users regarding compatibility.
- **Condition for Directory Creation**: A plugin directory will only be created when a fully researched, documented, and verified adapter for that specific agent is implemented and accompanied by automated integration tests.
- **Separation Principle**: Every adapter must contain its own self-contained metadata and manifest. Shared logic must be limited to reading the canonical skill from `skills/safe-change/SKILL.md`.

---

## 5. Canonical Source: `skills/safe-change/SKILL.md`

The file `skills/safe-change/SKILL.md` is the single canonical source of truth for safe-change skill behavior:
- It defines the canonical name (`safe-change`), description, trigger conditions, core rules, CLI invocation contracts, and baseline format limitations (validated in Milestone B test suite).
- No plugin adapter or installer may fork, re-author, or modify the core instructional contract.
- Any agent-specific packaging must either copy the canonical file without alteration or embed it via an automated, verified build transformation step that preserves exact semantic identity.

---

## 6. Bundling Strategy and Content Drift Prevention

To prevent content drift between repository source files and distributed packages:
1. **Direct Packaging**: The canonical `skills/safe-change/SKILL.md` is included directly in the npm distribution package via the `files` array in `package.json` (validated in package dry-run).
2. **Byte Identity Verification**: When the installer executes in the field, it must copy the canonical skill from its packaged location and perform an SHA-256 integrity check against the embedded package hash.
3. **Drift Prevention in Monorepo/Multi-Agent**: If an adapter requires wrapping the canonical skill with vendor-specific metadata, the build step must validate that the inner instruction text matches the SHA-256 hash of `skills/safe-change/SKILL.md`. If hashes mismatch, the build must fail immediately.

---

## 7. Proposed Installer Command Design

The proposed installer commands are designed to follow an explicit, subcommand-based CLI structure under the `safe-change` executable (not yet implemented):

- `safe-change install [target-agent]`
  Installs the skill/plugin for the designated agent. Defaults to interactive detection if `target-agent` is omitted.
- `safe-change update [target-agent]`
  Updates an existing installation to match the current canonical skill version.
- `safe-change uninstall [target-agent]`
  Removes safe-change files and metadata without touching sibling files or user data.
- `safe-change status [target-agent]`
  Inspects installation health, verifies file hashes, and reports drift or collisions without making modifications.

### Core Command Flags
- `--scope <workspace|global>`: Explicitly specifies target scope. Defaults to `workspace`.
- `--dry-run`: Simulates the operation and reports all intended actions without touching disk.
- `--force` / `--overwrite`: Authorizes overwriting safe-change managed files during update.
- `--non-interactive`: Disables interactive prompts; fails immediately if confirmation is required.
- `--json`: Outputs structured JSON results for programmatic consumption.

---

## 8. Interactive Mode

Interactive mode is designed to be the default when safe-change commands are run in a TTY environment (not yet implemented):
1. **Target Discovery**: Scans the workspace for agent markers (e.g. `.agents/`, `.cursor/`, `AGENTS.md`) and presents a list of detected agents with clear status badges (`candidate`, `partially verified`).
2. **Scope Confirmation**: Clearly displays the resolved absolute path where files will be written.
3. **Change Preview**: Displays planned file additions, file updates, and estimated byte changes.
4. **Collision Prompt**: If a managed file with differences exists, prompts the user:
   - `[o] Overwrite with new version`
   - `[d] Show diff`
   - `[s] Skip this target`
   - `[a] Abort operation`
5. **No Blind Prompts**: Every prompt must include the exact target file path and explain the consequence of each option.

---

## 9. Non-Interactive Mode

Non-interactive mode is designed for CI environments and scripted pipelines (`--non-interactive` or non-TTY stdin):
1. **Strict Explicitness**: All required parameters (`target-agent`, `--scope`) must be provided on the command line. Missing parameters must cause an immediate exit with code `2` (CLI usage error).
2. **Zero Prompts**: The installer must never attempt to read `stdin` in non-interactive mode.
3. **Collision Halting**: If a collision is encountered and `--overwrite` was not explicitly provided, the operation must halt immediately with exit code `4` (Collision / Safety Violation), leaving existing files untouched.
4. **Deterministic Output**: Formats machine-readable progress and error information to `stdout` and `stderr`.

---

## 10. `--dry-run`

The `--dry-run` flag is designed to provide full simulation of any installer lifecycle command without disk modification (not yet validated in production code):
1. **Read-Only Guarantee**: No directory creation, file creation, file modification, or file deletion may be performed during a dry run.
2. **Full Validation**: Must execute complete path resolution, boundary checks, home-directory validation, symlink inspection, and collision detection.
3. **Structured Reporting**: Outputs a planned execution manifest:
   - Target scope and resolved absolute paths.
   - Files to be created or overwritten.
   - SHA-256 hash comparison between existing target files and source canonical files.
   - Any warnings regarding `.gitignore` or unverified agent runtime behaviors.
4. **Exit Code**: Must return `0` if all pre-conditions are satisfied and installation would succeed; must return non-zero error codes if pre-conditions fail.

---

## 11. Explicit Overwrite Confirmation

To protect user modifications from accidental loss:
1. If the target file exists and its content differs from the source:
   - In interactive mode: Must prompt for explicit confirmation with options to view diff or abort.
   - In non-interactive mode: Must fail immediately unless `--overwrite` is explicitly specified.
2. If the existing file is identical (matching SHA-256): Must report `already-up-to-date` without prompting and exit cleanly with code `0`.
3. If an unrecognized file occupies the target directory: Must refuse to overwrite even with `--overwrite` unless an additional `--force-unrecognized` flag is provided.

---

## 12. Collision Detection

Collision detection is designed to operate hierarchically before any write operation is scheduled (validated in fixture; not yet validated in production CLI):

1. **Path-Type Collisions**:
   - A regular file exists where a directory is required (e.g. `.agents/skills/safe-change` is a regular file).
   - A directory exists where a regular file is expected.
2. **Foreign-Ownership Collisions**:
   - The target skill directory exists but lacks the safe-change ownership manifest or marker.
3. **Content Divergence**:
   - A safe-change file exists, but its content has been customized by the user.
4. **Collision Action**:
   - All collisions must be detected in a non-destructive read phase. If a collision is detected, the operation must abort with a descriptive diagnostic message detailing the conflicting path and reason.

---

## 13. Update Strategy

The update lifecycle is designed to safely bring an existing installation up to date (not yet validated in production code):
1. **State Inspection**: Must read existing files and verify safe-change ownership markers.
2. **Drift Detection**: Must compute SHA-256 of installed files vs canonical source.
3. **Staging**: Must write updated files to an isolated temporary staging directory (`.tmp-safe-change-<uuid>`) within the same filesystem boundary.
4. **Atomic Swap**: Must replace installed files atomically using rename operations where supported by the operating system.
5. **Rollback on Failure**: If an error occurs during replacement, original files must be restored from backup.

---

## 14. Uninstall Strategy

The uninstall lifecycle is designed to cleanly remove safe-change artifacts (validated in fixture; not yet validated in production CLI):
1. **Target Verification**: Must confirm that the target directory is indeed a safe-change installation (checks ownership markers).
2. **Safe Removal**: Must delete only safe-change specific files (`SKILL.md`, `.safe-change-manifest.json`).
3. **Parent Directory Pruning**: Must remove the parent directory (`.agents/skills/safe-change/`) only if it is completely empty.
4. **Preservation of Sibling Data**: Must never remove or alter sibling skills (`.agents/skills/other-skill/`) or shared parent directories (`.agents/`).
5. **No Git Mutation**: Must not attempt to alter Git history, unstage files, or touch `.gitignore`.

---

## 15. Rollback Strategy

The installer architecture is designed to maintain transaction integrity across multi-file operations (not yet validated in production code):
1. **Backup Snapshot**: Before mutating any file during update or install, an in-memory or atomic temporary copy of pre-existing state must be recorded.
2. **Failure Trapping**: All write operations must be wrapped in structured error handlers (`try ... catch`).
3. **Restoration**: On unexpected failure, all partially created files must be unlinked, and backed-up original files must be restored to their original paths.
4. **Integrity Check**: Must verify that post-rollback state matches pre-operation state before terminating.

---

## 16. Cancellation Strategy

When a user cancels an operation (via interactive prompt abort, UI cancellation, or programmatic flag):
1. **Immediate Halt**: Must halt execution before initiating any filesystem writes.
2. **Zero Modification**: Must ensure no temporary directories or partial files remain on disk.
3. **Status Reporting**: Must return exit code `0` or dedicated cancellation status with message `Operation cancelled by user; no files modified.`

---

## 17. Interrupted Process Handling

To handle abnormal process termination (`SIGINT`, `SIGTERM`, `SIGHUP`, `process.exit`):
1. **Signal Listeners**: The future implementation must register signal handlers during active file operations.
2. **Staging Cleanup**: Any temporary staging directory created during the transaction must be unlinked immediately synchronously or via a registered exit handler.
3. **Atomic Operations**: Primary writes must use atomic renames on POSIX and safe file swapping on Windows, designed so that an interrupted process leaves either the complete old version or the complete new version, never a corrupted or truncated half-written file.

---

## 18. Exit Codes

The proposed installer is designed to adhere strictly to the existing safe-change exit code convention:

| Exit Code | Meaning | Context in Installer |
| --- | --- | --- |
| `0` | Success | Operation completed successfully, or clean `--dry-run` passed. |
| `1` | Failure / Error | Internal error, unhandled exception, or unexpected failure. |
| `2` | CLI Usage Error | Invalid flags, missing required arguments, or unknown target agent. |
| `3` | Configuration Drift / Missing | Target configuration corrupt or invalid. |
| `4` | Collision / Safety Violation | Symlink detected, path boundary violation, or unapproved collision. |
| `5` | Unclean Baseline / Interrupted | Process interrupted or aborted mid-operation. |

---

## 19. Path Boundary Enforcement

The installer must enforce zero-trust path boundary constraints (filesystem algorithms validated in fixture; CLI integration not yet validated):
1. **Strict Containment**: Target paths must resolve strictly within the designated root (`targetRoot`).
2. **Canonical Resolution**: Paths must be resolved using `path.resolve` and normalized across operating system separators.
3. **Traversal Prevention**: Relative components such as `..` or `.` must be resolved and checked to confirm that `path.relative(root, resolved)` does not start with `..` and is not absolute.
4. **Drive Letter Validation (Windows)**: On Windows, operations must be on the same volume drive letter as `targetRoot`.

---

## 20. Workspace and Home-Directory Policy

The architecture strictly distinguishes between workspace scope, global scope, and universally forbidden paths:

### 1. Workspace Scope
- **Definition**: The user-selected project or repository root.
- **Selection**: Must be explicitly selected (e.g., current working directory or explicit CLI argument).
- **Legitimate Home Descendants**: User projects are normally and legitimately located under user directory trees (such as `/home/user/projects/project`, `/Users/user/Documents/project`, or `C:\Users\user\Documents\project`). The installer must permit these paths when they represent an explicitly selected workspace root.
- **Safety Boundary**: All writes within workspace scope must be confined strictly inside the selected workspace root. Any path traversal attempting to escape the workspace root is rejected.
- **No Confusion with Home Root**: Workspace scope must never be confused with arbitrary writes to the home directory.

### 2. Global Scope
- **Explicit Confirmation**: Global scope must require the explicit `--scope global` flag and interactive confirmation.
- **Strict Allowlist**: Must write exclusively to a documented, agent-specific allowlist (e.g., `<homedir>/.gemini/config/skills/safe-change/` for Antigravity).
- **No Arbitrary Writes**: Must never write to arbitrary home files, shell initialization scripts (`.bashrc`, `.zshrc`, PowerShell profiles), or unrelated dotfiles.

### 3. Universally Forbidden Paths
The installer must reject the following paths across all scopes and operations without exception:
1. **Home Directory Root**: The user home directory root itself (`~`, `/home/user`, `/Users/user`, `C:\Users\user`) is never a valid workspace root.
2. **Arbitrary Home Descendants in Global Scope**: Any global path outside the documented agent allowlist is strictly forbidden.
3. **Path Traversal**: Any path containing `..` resolving outside the authorized boundary.
4. **Unexpected Symlinks and Junctions**: Any path pointing to or traversing a symlink or NTFS junction.
5. **Paths Outside Selected Scope**: Any write operation that resolves outside the explicitly chosen scope root.
6. **Unreviewed Shared Instruction Mutation**: Modifying shared instruction files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`) without a reviewed merge policy.

---

## 21. Symlink and Junction Policy

1. **Zero-Trust Symlink Handling**:
   - The installer must never create symbolic links or NTFS directory junctions.
   - The installer must inspect every target directory and file using `fs.lstat` before reading or writing (validated in fixture).
2. **Rejection Rule**:
   - If any component of the target path is a symlink or junction, the installer must immediately halt with a `Safety violation` error.
3. **No Following**:
   - Files must never be opened with write flags through symlinks.

---

## 22. TOCTOU Mitigation

Time-Of-Check to Time-Of-Use (TOCTOU) race conditions are designed to be mitigated through:
1. **Pre-Write Verification**: Re-checking file descriptors and directory entries with `lstat` immediately prior to open/write calls (validated in fixture).
2. **Atomic File Replacement**: Writing content to temporary files in the same directory and renaming via `fs.renameSync` (or safe replacement on Windows).
3. **File Descriptor Operations**: Where supported by platform APIs, operating on open file descriptors (`fstat`, `fsync`) rather than path strings.

---

## 23. Windows, macOS, and Linux Considerations

| Consideration | Windows | macOS | Linux |
| --- | --- | --- | --- |
| **Filesystem Sensitivity** | Case-insensitive (NTFS default). Case-variant checks must normalize path casing (validated in fixture). | Typically case-preserving, case-insensitive (APFS default). | Strictly case-sensitive (ext4/btrfs). Identical name with different case is a distinct file (validated in fixture). |
| **Path Separators** | Backslash `\` and forward slash `/`. Path normalization must handle mixed separators. | Forward slash `/`. | Forward slash `/`. |
| **Atomic Renames** | `fs.rename` fails if destination file exists and is open. Requires retry or staging replacement. | POSIX atomic `rename` replaces destination atomically. | POSIX atomic `rename` replaces destination atomically. |
| **Temporary Dirs** | `os.tmpdir()` is inside `%USERPROFILE%\AppData\Local\Temp` (inside home). | `os.tmpdir()` is typically `/var/folders/...` (outside home). | `os.tmpdir()` is `/tmp` (outside home). |
| **Directory Links** | NTFS Junctions and Symlinks. Both detected via `lstat` (validated in fixture). | POSIX Symlinks. Detected via `lstat` (validated in fixture). | POSIX Symlinks. Detected via `lstat` (validated in fixture). |

---

## 24. File Ownership Markers

To distinguish safe-change managed files from user-created or foreign files, the future implementation must:
1. **Manifest File**: Write a hidden metadata manifest:
   `.agents/skills/safe-change/.safe-change-manifest.json`
   Containing:
   - `schemaVersion`: Manifest format version.
   - `packageName`: `safe-change`.
   - `installedVersion`: Package version installed.
   - `installedAt`: ISO timestamp.
   - `managedFiles`: Array of managed file paths and their SHA-256 hashes.
2. **Header Comments**: In generated instruction files where comments are permitted, include an explicit ownership marker:
   `<!-- Managed by safe-change. Do not edit manually; use safe-change update. -->`
3. **Safety Check**: Uninstallation and update routines must verify the manifest before removing or modifying files.

---

## 25. Protection for User-Owned Files

1. **Non-Destructive Principle**: Files without valid safe-change ownership markers must be classified as user-owned and treated as strictly read-only by the installer.
2. **No Truncation**: No open flag with `w` or `w+` may ever be executed on a user-owned file.
3. **Collision Preservation**: If a user creates a custom `SKILL.md` inside `.agents/skills/safe-change/` without safe-change markers, the installer must refuse to modify it and advise the user to rename or back up their file.

---

## 26. Policy for `AGENTS.md`, `CLAUDE.md`, and Equivalent Instruction Files

Shared root instruction files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`) present unique multi-tool collision risks because they are typically owned by the repository maintainer and contain project-wide instructions.

### The Conflict Problem
Appending or modifying instructions in a shared markdown file risks:
- Cluttering user prompts with duplicate or conflicting rules.
- Silently altering repository instructions without maintainer approval.
- Corrupting manual formatting, existing prompts, or custom headings.

### Architectural Policy
1. **No Silent Mutation**: The installer must never automatically edit, append to, or prepend to `AGENTS.md`, `CLAUDE.md`, or `.cursorrules`.
2. **Dedicated Skill Priority**: The installer exclusively targets dedicated, namespaced skill directories (e.g. `.agents/skills/safe-change/SKILL.md`).
3. **Merge Advisory**: If an agent relies exclusively on a shared instruction file (e.g., Codex using `AGENTS.md`), the installer will operate in advisory mode:
   - Generate a recommended snippet block with explicit delimiters:
     ```markdown
     <!-- BEGIN safe-change INSTRUCTIONS -->
     ...
     <!-- END safe-change INSTRUCTIONS -->
     ```
   - Print the snippet to terminal and provide clear instructions for manual insertion, rather than rewriting the file.
4. **Automated Merge Restriction**: Automated merging into shared files is postponed until a deterministic, tested merge engine with full collision detection and rollback is designed.

---

## 27. Security Threat Model

The installer is designed to operate in developer environments where untrusted repositories or adversarial inputs may be present:

| Threat | Attack Vector | Mitigation in Architecture |
| --- | --- | --- |
| **Arbitrary File Overwrite** | Path traversal in agent names (e.g., `../../etc/passwd`) | Strict path canonicalization, boundary validation, and rejection of traversal characters. |
| **Symlink Poisoning** | Pre-creating a symlink in `.agents/skills/safe-change` pointing to critical user files | `fs.lstat` inspection before every access; immediate rejection of symlinks and junctions (validated in fixture). |
| **Privilege Escalation** | Running installer with elevated privileges (`sudo`, Administrator) | Installer must explicitly warn or refuse to run under `sudo` / Administrator unless installing system-wide. |
| **Malicious Repository Drift** | An untrusted repository containing crafted config trying to hijack skill paths | Installer only writes to predefined, sandboxed directories within the active workspace root. |
| **Dependency Hijacking** | Malicious packages masquerading as safe-change skills | Skill source is bundled inside the verified npm package; no dynamic downloads from external URLs. |

---

## 28. Trust Boundaries

1. **Package Trust Boundary**:
   - The npm package contents signed/published under `safe-change` are trusted.
   - The canonical `skills/safe-change/SKILL.md` within the package is trusted.
2. **Filesystem Trust Boundary**:
   - The user workspace filesystem is considered potentially hostile or tainted (may contain symlinks, existing files, read-only permissions).
   - The user home directory is strictly protected and non-writable by default.
3. **Execution Trust Boundary**:
   - Child processes spawned by the installer are prohibited. The installer must perform only direct Node.js filesystem API calls.

---

## 29. Test Strategy

Any future implementation of the installer must pass a rigorous multi-tier test suite before release:

1. **Unit Tests**:
   - Path resolution and boundary enforcement functions.
   - Ownership manifest serialization and deserialization.
   - SHA-256 hash comparison and drift detection.
   - Exit code consistency across all failure modes.
2. **Filesystem Fixture Tests**:
   - Clean installation into isolated temporary project directory (validated for Antigravity in `tests/integration/antigravity-fixture.test.ts`).
   - Detection of pre-existing collisions (files, directories) (validated in fixture).
   - Rejection of symlinks, junctions, and relative traversals (validated in fixture).
   - Idempotent update execution (validated in fixture).
   - Complete cleanup during uninstallation (validated in fixture).
3. **Cross-Platform Integration Tests**:
   - Execution on Windows, macOS, and Linux runners in CI.
   - Validation of case-sensitivity handling across filesystems (validated in fixture).
   - Line ending preservation (`LF` vs `CRLF`) (validated in fixture).
4. **Process Interruption Tests**:
   - Simulation of `SIGINT` mid-transaction to verify zero orphaned files and proper rollback.

---

## 30. Package and npm Distribution Strategy

1. **Package Contents**:
   - The npm package includes:
     - `dist/` (compiled TypeScript CLI binaries).
     - `skills/safe-change/SKILL.md` (canonical skill).
     - `README.md`, `LICENSE`, `SECURITY.md`, `GUIDE.md`.
2. **Distribution Mechanism**:
   - Primary: `npx safe-change install [agent]` (designed to run the verified package directly without persistent global binary installation).
   - Secondary: `npm install -g safe-change` for developers desiring the global CLI.
3. **Publishing Safeguards**:
   - `npm pack --dry-run` validation in CI to confirm exact file counts (currently 53 files in baseline; validated).
   - Automated git tag and release branch verification.

---

## 31. Release Gates

Before any production code for Milestone C is released, the following gates must be satisfied:

1. **Architecture Sign-Off**: Formal review of this specification (`docs/installer-architecture.md`) by project leadership.
2. **Fixture Validation**: All filesystem fixture tests pass with 100% success on Windows, macOS, and Linux runners.
3. **Zero Test Regressions**: Existing 95 tests across 7 test files continue to pass without modification or weakening (validated).
4. **Zero Production Mutation**: Core CLI commands (`save`, `check`, `diff`) and baseline managers remain completely untouched (validated).
5. **No Undocumented Assumptions**: All supported agent targets must have documentation-verified paths and reproducible validation evidence.

---

## 32. Unresolved Questions

The following architectural questions remain open and will require empirical research or runtime testing before implementation:

1. **Antigravity Public Specification**:
   - When will Antigravity release a public specification URL for external auditor verification?
   - Does Antigravity IDE require a workspace window reload to detect newly added `.agents/skills/` directories, or is file watching reactive?
2. **Shared Prompt Merging**:
   - What is the optimal, zero-risk strategy for agents like Codex that lack dedicated skill directories and rely solely on `AGENTS.md`?
   - Should safe-change completely decline automated writes to `AGENTS.md` and remain strictly manual/advisory?
3. **Windows UNC and Network Drives**:
   - How should the installer handle workspaces mounted over SMB/UNC paths (`\\server\share`) where NTFS junction checks and symlink resolution may behave differently?
4. **Multiple Agent Coexistence**:
   - If a developer uses both Cursor and Antigravity in the same workspace, should `safe-change install` install both adapters, or should it require explicit sequential commands?
