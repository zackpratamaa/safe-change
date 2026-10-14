# Antigravity Installation Fixture and Validation Plan

> Historical research/design snapshot, not current operational instructions or live-runtime certification. For current behavior use [Verification integrity](verification-integrity.md), [MCP setup](mcp-setup.md), and the [runtime evidence matrix](runtime-verification.md). Earlier phase/test-count statements below describe that snapshot.

This document details the test fixture, validation methodology, and behavioral boundaries implemented to evaluate safe-change skill installation for Antigravity.

Verified Public Baseline Commit:
`47563bb26095a981899e12f0d6d2c993c9f7ac20`

Classification:
"Filesystem fixture validated; Antigravity runtime discovery not independently verified."

---

## 1. Overview and Status

Antigravity remains a candidate target for the first runtime integration, not a verified installer target.

Prior research established that the canonical skill at `skills/safe-change/SKILL.md` matches the documented directory structure and YAML frontmatter requirements of Antigravity (`.agents/skills/<name>/SKILL.md`). However, before designing or writing a production installer, filesystem operations, collision safety, path boundaries, and lifecycle behaviors must be tested in an isolated fixture.

This fixture verifies file-system mechanics within isolated temporary directories without modifying user data or running production installation commands.

---

## 2. What Was Actually Tested

The automated fixture tests (`tests/integration/antigravity-fixture.test.ts` and `tests/fixtures/antigravity-fixture.ts`) validated the following behaviors:

1. **Byte-for-Byte Identity**:
   - The canonical skill file at `skills/safe-change/SKILL.md` is copied into the target directory.
   - The copied file is verified to be 100% byte-for-byte identical to the source canonical file using buffer comparison (`bufA.equals(bufB)`).
2. **Frontmatter Integrity**:
   - The YAML frontmatter remains intact after copying.
   - Validated that `name: safe-change` and a non-empty `description` string exist and are parseable across both LF and CRLF line-ending formats.
3. **Directory Structure and Naming**:
   - The target skill directory is created exactly as `.agents/skills/safe-change/`.
   - The directory name is strictly `safe-change` (kebab-case).
4. **Side-Effect Isolation**:
   - Unrelated files in the project workspace (e.g., `package.json`, existing `.agents/rules/*.md`, sibling skills like `.agents/skills/other-tool/`) remain completely unmodified.
5. **Collision Detection**:
   - If `.agents/skills/safe-change/` already exists with pre-existing or custom content, the fixture detects the existing directory and refuses to overwrite by default, returning a `collision_detected` status with zero bytes written.
6. **Regular-File Collision Detection**:
   - If a regular file exists where the `.agents/skills/safe-change` directory is expected, the fixture detects the collision, returns an actionable error message, and does not overwrite or truncate the file.
7. **Symlink and Junction Rejection**:
   - The fixture strictly forbids following symbolic links or directory junctions.
   - If `.agents/skills/safe-change` is a symlink or junction pointing outside the fixture, both installation and uninstallation throw an immediate safety violation, leaving external directories unmodified.
   - If the target file `SKILL.md` is a symlink, write operations reject it.
   - TOCTOU replacement attacks (substituting a symlink between directory creation and file write) are detected and blocked prior to writing.
8. **Explicit Update Behavior**:
   - When explicit authorization (`overwrite: true`) is provided, existing files are updated, and the resulting file is verified to match the canonical skill.
9. **Explicit Uninstall Behavior**:
   - Uninstalling cleanly removes `.agents/skills/safe-change/`.
   - The parent `.agents/skills/` directory and sibling skills remain intact.
10. **Cancellation Safety**:
    - If an installation or update operation is cancelled (`cancel: true`), no files are written or modified, leaving any existing state intact.
11. **Scope Isolation**:
    - Operations targeting project scope (`.agents/skills/`) never touch the global configuration scope (`.gemini/config/skills/`), and vice versa.
12. **Home-Directory Boundary Policy**:
    - The fixture enforces strict boundary-safe path checks rejecting the home directory, any direct child of home, nested descendants of home, path traversals with `..`, and case-variant representations.
13. **Verified Cleanup**:
    - The fixture verifies directory removal upon cleanup and raises explicit errors with root-cause diagnostics if deletion fails, rather than silently suppressing errors.

---

## 3. Home-Directory Boundary Policy

The fixture implements a zero-trust policy regarding user files and paths:

1. **Rejection Rules**:
   - `targetRoot` equal to `os.homedir()` is strictly rejected.
   - Direct children of `os.homedir()` (e.g., `~/projects`, `C:\Users\<user>\code`) are strictly rejected.
   - Arbitrary descendants below `os.homedir()` outside the designated temporary directory are strictly rejected.
   - Path traversals resolving into `os.homedir()` using `..` are strictly rejected.
   - Case-variant representations of `os.homedir()` on case-insensitive filesystems (e.g., Windows) are normalized and rejected.
   - The system temporary directory root itself (`os.tmpdir()`) is rejected to prevent polluting the shared temp root.
2. **Boundary Comparison Logic**:
   - Paths are resolved via `path.resolve` and `fs.realpathSync` where paths exist.
   - Comparisons use `path.relative` to evaluate directory containment without relying on fragile string-prefix checks.
3. **Platform Behavior for Windows Temp**:
   - On Windows, `os.tmpdir()` defaults to `%USERPROFILE%\AppData\Local\Temp`, which is located physically under the user home directory.
   - The fixture permits disposable subdirectories strictly located inside `os.tmpdir()`, while maintaining total rejection of any other path under `os.homedir()`.
4. **Separation from Production Global-Install Policy**:
   - This strict boundary applies to the test fixture to guarantee zero mutation of real user environments during testing.
   - Any future production installer supporting global installation into `~/.gemini/config/skills/safe-change` will require an explicit allowlisted destination design, dedicated interactive confirmation, and a separate security review before implementation.

---

## 4. Symlink, Junction, and Collision Defense

1. **Inspection with `lstat`**:
   - The fixture inspects paths using `fs.lstatSync` rather than `fs.existsSync` to detect symbolic links and directory junctions before any operation.
2. **Symlink Prohibition**:
   - Symlinks and junctions are never created, followed, or traversed.
   - If an existing target directory or file is a symlink, the operation aborts with a `Safety violation` error.
3. **TOCTOU Defense**:
   - Re-checks path state with `lstatSync` immediately before writing to defend against time-of-check to time-of-use symlink substitution attacks.
4. **Regular-File Collision**:
   - If a regular file occupies the path expected for a directory, the fixture reports `collision_detected` and halts with zero bytes written.

---

## 5. Cleanup Guarantees

1. **Verified Removal**:
   - `cleanupFixtureWorkspace` executes removal and immediately verifies that `fs.existsSync` reports `false`.
2. **Retry Mechanism**:
   - In environments where transient file locks may occur (such as Windows), cleanup retries removal up to 3 times with configurable backoff.
3. **Explicit Error Surfacing**:
   - Cleanup failures are never silently suppressed. If the directory remains after retries, an explicit error is thrown:
     `Cleanup failure: Failed to remove temporary directory at '<path>' after N attempts.`

---

## 6. What Was Only Simulated

1. **Simulated Project Workspace**:
   - Tests execute within disposable temporary directories created via `createFixtureWorkspace("safe-change-fixture-proj-")` and cleaned up in `afterEach`.
2. **Simulated Global Environment**:
   - Global configuration paths are tested against a disposable fake home directory (`safe-change-fixture-home-`), not the actual user home directory.
3. **User Interaction**:
   - Prompts for overwrite confirmation and cancellation are simulated via structured options flags rather than an interactive terminal prompt.
4. **Agent Runtime Discovery**:
   - The Antigravity IDE agent runtime was not launched to evaluate live prompt activation. Only the underlying filesystem contract was tested.

---

## 7. Target Paths

### Project-Level Target Path
- **Canonical Relative Path**: `.agents/skills/safe-change/SKILL.md`
- **Full Path in Project**: `<project-root>/.agents/skills/safe-change/SKILL.md`
- **Aliases Recognized by Antigravity Specification**: `.agent/`, `_agents/`, `_agent/` (the fixture and candidate installer standardize on `.agents/`).

### Future Global Target Path
- **Linux / macOS**: `$HOME/.gemini/config/skills/safe-change/SKILL.md`
- **Windows**: `%USERPROFILE%\.gemini\config\skills\safe-change\SKILL.md`
- **Precedence**: Workspace `.agents/skills/safe-change/` has Priority 1 and strictly overrides global `~/.gemini/config/skills/safe-change/` (Priority 3).

---

## 8. Why Runtime Discovery Remains Unverified

The fixture validates that the filesystem state conforms to the Antigravity Customization System specification. However, live runtime discovery remains unverified for the following reasons:

1. **No Automated Agent Harness**:
   - There is currently no headless CLI harness available within the safe-change test suite to launch the Antigravity IDE, submit a prompt, and observe whether Antigravity's progressive disclosure system injects `safe-change` into context.
2. **Context Window Ingestion**:
   - Antigravity specification states that skill names and descriptions are injected into system context during startup or turn boundaries, and the body is loaded on-demand. Whether Antigravity's model correctly activates `safe-change` on relevant prompts requires live end-to-end interaction testing.
3. **Cache Invalidation Latency**:
   - Whether mid-session installation is detected on the next turn or requires an IDE reload has not been tested against a running instance.

Therefore, the fixture is classified as:
"Filesystem fixture validated; Antigravity runtime discovery not independently verified."

---

## 9. Exact Commands Used

The following validation commands were used during testing:

```bash
# Build the TypeScript codebase
npm run build

# Run TypeScript type check across the codebase
npm run lint

# Run the complete test suite (all unit and integration tests)
npm test

# Run only the Antigravity installation fixture tests
npx vitest run tests/integration/antigravity-fixture.test.ts
```

---

## 10. Operating System Limitations

1. **Path Separators**:
   - Windows uses backslashes (`\`) while POSIX environments use forward slashes (`/`). The fixture uses `path.join` and `path.resolve` to ensure cross-platform path normalization.
2. **Case Sensitivity**:
   - Windows NTFS is case-preserving but case-insensitive by default. POSIX filesystems (e.g., ext4) are case-sensitive. The skill directory name must be strictly lowercase (`safe-change`) to prevent mismatch across operating systems.
3. **Symlink and Junction Privileges**:
   - Creating symbolic links on Windows often requires elevated administrator privileges or Windows Developer Mode. To guarantee universal compatibility, the fixture strictly avoids creating symlinks or junctions during installation, and actively detects and rejects existing symlinks.
4. **File Locking**:
   - On Windows, files opened by running processes cannot be deleted or overwritten until closed. Clean uninstall and update implementations handle potential `EBUSY` or `EPERM` conditions with retry and explicit error surfacing.

---

## 11. Next Steps and Blockers Before Production Installer

The following items must be resolved before proceeding to production installer implementation:

1. **Interactive Prompt Design**:
   - Designing an interactive CLI prompt for scope selection (`project` vs `global`), collision resolution (`overwrite` vs `abort`), and dry-run reporting.
2. **Live Runtime Validation**:
   - Testing an actual safe-change skill installation inside an active Antigravity IDE session to confirm that the model discovers and invokes `safe-change` when prompted.
3. **Allowlisted Global Destination Security Review**:
   - Formalizing the security design for global installation under `~/.gemini/config/skills/` before granting write permissions outside project roots.
4. **No Production Installer Yet**:
   - No production installer command is exposed or documented as available in this milestone.
