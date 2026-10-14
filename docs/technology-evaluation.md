# Technology Evaluation: TypeScript vs TypeScript + Rust Helper

> Historical research/design snapshot, not current operational instructions or live-runtime certification. For current behavior use [Verification integrity](verification-integrity.md), [MCP setup](mcp-setup.md), and the [runtime evidence matrix](runtime-verification.md). Earlier phase/test-count statements below describe that snapshot.

Verified Baseline Status:
"Filesystem adapter packaging validated; Antigravity runtime discovery not independently verified."

Current Phase:
Technology Architecture Decision for Milestone C (Installer and Distribution). No production installer code is implemented.

---

## 1. Executive Summary

This document evaluates whether safe-change should remain implemented strictly in 100% TypeScript and Node.js (Option A) or adopt a hybrid architecture comprising TypeScript for CLI orchestration alongside an optional Rust native helper for security-critical filesystem operations (Option B).

### Core Finding
Standard Node.js built-in APIs (`node:fs` and `node:path`) provide all necessary primitives to enforce path boundaries, reject symlinks and junctions, detect collisions, preserve uncommitted changes, and perform safe file replacements. The existing 108 automated tests in safe-change demonstrate that all targeted safety invariants are fully enforceable without native code. Introducing Rust at this stage would introduce significant packaging, distribution, and cross-compilation complexity without solving an active, demonstrated technical limitation.

---

## 2. Options Under Evaluation

### Option A: 100% TypeScript and Node.js
- **Scope**: Entire CLI, baseline comparator, Git inspector, installer lifecycle, and agent adapters written in TypeScript and executed via the Node.js runtime.
- **Dependencies**: Zero external native dependencies; relies exclusively on standard Node.js built-ins (`node:fs`, `node:path`, `node:crypto`, `node:os`).
- **Distribution**: Pure JavaScript/TypeScript npm package requiring only `node >= 18.0.0`.

### Option B: TypeScript CLI + Native Rust Filesystem Helper
- **Scope**: CLI UI, commands, and high-level orchestration in TypeScript; low-level path boundary validation, symlink traversal checking, handle-based file opening (`openat`, `CreateFileW`), and atomic swapping implemented in Rust.
- **Integration**: Compiled native dynamic library via Node-API (`napi-rs`) or an auxiliary standalone binary invoked via standard input/output.
- **Distribution**: Pre-compiled binary artifacts built for each target OS/architecture triple distributed via optional npm platform packages or prebuild archives.

---

## 3. Detailed Comparison Across 27 Evaluation Criteria

| # | Evaluation Criterion | Option A: 100% TypeScript (Node.js) | Option B: TypeScript + Rust Helper | Comparative Evaluation |
|---|---|---|---|---|
| **1** | **Path Boundary Validation** | Handled via `path.resolve` and `path.relative`. Validates that child path does not start with `..` and stays within designated root. | Handled via canonical path resolution (`std::fs::canonicalize`) and prefix slicing or path component iteration. | **Tie**. Both approaches mathematically verify path containment. Validated in safe-change test suite. |
| **2** | **Path Traversal Protection** | Prevents traversal by normalizing paths before filesystem access and verifying root boundary containment. | Prevents traversal via path component parsing and native descriptor pinning. | **Tie**. Node.js path normalization reliably blocks `..` traversals across all platforms. |
| **3** | **Symlink Detection** | Detected via `fs.lstatSync` prior to reading or writing. Rejects links immediately if `stat.isSymbolicLink()`. | Detected via `std::fs::symlink_metadata` or `O_NOFOLLOW` flag during open. | **Option B slightly superior in kernel defense**, but **Option A fully adequate** for user-space safety net. |
| **4** | **Junction Detection (Windows)** | On Windows NTFS, `fs.lstatSync` flags directory junctions as symbolic links (`isSymbolicLink() === true`). | Detected via `FILE_ATTRIBUTE_REPARSE_POINT` through Win32 `GetFileAttributesW`. | **Tie**. Node.js maps NTFS junctions to symbolic links in `lstat`, permitting identical rejection logic. |
| **5** | **TOCTOU Mitigation** | Minimized via immediate pre-write re-check with `lstat` and atomic replacement. Cannot fully eliminate kernel-level race between `lstat` and `open`. | Can open parent directory descriptor and use `openat(dirfd, ..., O_NOFOLLOW)` or Win32 `FILE_FLAG_OPEN_REPARSE_POINT`, closing kernel TOCTOU. | **Option B superior for adversarial multi-tenant environments**; Option A is sufficient for single-user local developer workstations. |
| **6** | **Atomic File Replacement** | Implemented via temporary file staging in same directory (`.staging-*.tmp`) and `fs.renameSync`. POSIX atomic; safe replacement on Windows. | Implemented via atomic rename (`std::fs::rename`) or platform-specific transactional APIs. | **Tie**. Both approaches use identical OS kernel rename primitives (`rename(2)` and `MoveFileExW`). |
| **7** | **File Locking** | Advisory lockfiles or platform-specific lockfile emulation. | Direct access to OS advisory locks (`flock(2)`, `fcntl(2)`, `LockFileEx`). | **Option B superior for high-concurrency daemons**. Not required for safe-change, which is a single-invocation CLI. |
| **8** | **Collision Handling** | Detects pre-existing files or directories non-destructively using `fs.existsSync` and `lstatSync` before writing. | Detects collisions via `std::fs::metadata` or `O_EXCL` create flags. | **Tie**. Both systems provide clear, non-destructive collision diagnostics. |
| **9** | **Permission Errors** | Standard Node.js error codes (`EACCES`, `EPERM`, `EROFS`) mapped to structured diagnostics. | Native OS error numbers (`io::Error`) mapped to domain error enums. | **Tie**. Both report actionable permission errors to users. |
| **10** | **Windows Behavior** | Handles drive letters, UNC paths, and case-insensitivity. Validated in safe-change Windows test runs. | Requires explicit handling of wide strings (`LPCWSTR`) and Win32 path prefixes (`\\?\`). | **Option A superior in developer velocity** due to built-in Node.js Windows path normalization. |
| **11** | **macOS Behavior** | Handled natively by Node.js Darwin runtime. Normalizes path separators and permissions. | Handled natively by POSIX Rust libc bindings. | **Tie**. Both operate seamlessly on macOS. |
| **12** | **Linux Behavior** | Handled natively across glibc and musl environments. | Handled natively, but requires separate binaries for `glibc` vs `musl` (Alpine Linux). | **Option A superior in distribution portability**. |
| **13** | **Case-Sensitive Filesystem Behavior** | Evaluates filesystem sensitivity dynamically using disposable probing. Fully validated on Linux ext4/btrfs. | Evaluates filesystem sensitivity dynamically or queries mount points. | **Tie**. Both require empirical probing to determine filesystem case policy accurately. |
| **14** | **Case-Insensitive Filesystem Behavior** | Normalizes path casing on Windows NTFS and macOS APFS. Fully validated in fixture test suite. | Normalizes path casing via Win32 or Darwin APIs. | **Tie**. Safe-change already implements and validates this behavior in TypeScript. |
| **15** | **Performance for Large Repositories** | Inspects file entries in milliseconds for typical repos; up to ~1-2 seconds for repos with 100,000+ files. | Native multi-threaded directory traversal (e.g. `jwalk` or `ignore` crate) is 2-4x faster for massive repos. | **Option B superior for massive mono-repos (100k+ files)**. Option A is fast enough for standard repositories. |
| **16** | **Memory Usage** | Node.js V8 runtime baseline memory: ~30-50 MB RSS. | Rust helper memory usage: ~5-15 MB RSS. | **Option B superior in memory footprint**, though 40 MB is negligible on modern developer machines. |
| **17** | **Binary Distribution** | Pure JavaScript bundle distributed via npm. Architecture-independent. | Requires distributing pre-compiled binary executables or native dynamic libraries (`.node`). | **Option A significantly superior**. Pure JS works everywhere Node.js runs. |
| **18** | **npm Installation Experience** | Instant `npm install` or `npx safe-change` with zero compilation steps or post-install download scripts. | Often requires post-install binary downloading or native compilation on unsupported architectures. | **Option A significantly superior**. Eliminates installation failure points in corporate firewalls. |
| **19** | **Cross-Compilation** | None required. TypeScript compiles to platform-agnostic JavaScript. | Requires maintaining cross-compilation toolchains for x86_64, aarch64, Windows, macOS, Linux (GNU and musl). | **Option A significantly superior**. Zero cross-compilation overhead. |
| **20** | **Release Complexity** | Single build pipeline: `tsc`. Single tarball published to npm. | Multi-stage release pipeline: compiling, testing, signing, and packaging binaries for 6+ target triples. | **Option A significantly superior**. Minimal release friction and fewer points of pipeline failure. |
| **21** | **Debugging** | Standard JavaScript stack traces, sourcemaps, and Chrome/VS Code debugger integration. | Requires mixed-mode debugging (V8 stack traces + GDB/LLDB/WinDbg for native crashes). | **Option A significantly superior** for developer ergonomics and maintenance. |
| **22** | **Contributor Experience** | Any TypeScript developer can contribute without installing Rust, Cargo, or platform C compilers. | Contributors must maintain both Node.js and a working Rust toolchain. | **Option A significantly superior**. Lower barrier to open-source contributions. |
| **23** | **Security Reviewability** | Clean, readable TypeScript using audited standard library functions. Easily audited by web and Node.js security teams. | Requires auditing low-level `unsafe` blocks, FFI boundaries, and native OS interop. | **Option A superior for community auditability**; Option B requires specialized native security expertise. |
| **24** | **Testability** | Easily mocked using standard JavaScript test doubles and isolated filesystem fixtures in Vitest. | Testing native bindings requires compiled binaries for the host platform before running test suites. | **Option A significantly superior**. 108 tests run cleanly across all environments. |
| **25** | **Long-term Maintenance** | Single language ecosystem (TypeScript) across entire repository. | Dual language ecosystem (TypeScript + Rust) requiring dual dependency management (`package.json` + `Cargo.toml`). | **Option A significantly superior**. Prevents language fragmentation. |
| **26** | **Package Size** | Total npm package size is currently **48.6 kB** (unpacked: 200.6 kB). | Including native binaries for multiple platforms increases package size to **15 - 30 MB**. | **Option A drastically superior** (over 300x smaller distribution footprint). |
| **27** | **Failure and Interruption Handling** | Cleanly handled via `try ... catch` and process exit signals (`SIGINT`, `SIGTERM`). | Uncaught panics across FFI can abort the entire Node.js host process without executing JS finally blocks. | **Option A superior for graceful transaction rollback** within the Node.js process lifecycle. |

---

## 4. Environment Reality and Proof of Concept Audit

During the evaluation phase, an automated environment check was performed:
- `rustc`: Not installed in the execution environment.
- `cargo`: Not installed in the execution environment.

In accordance with strict repository integrity policies:
1. No Rust benchmarks have been fabricated or simulated.
2. A research prototype was created and executed in `experiments/typescript-filesystem/boundary-poc.ts` verifying path boundary checks, symlink detection, and atomic staging.
3. The Rust research directory (`experiments/rust-filesystem/README.md`) records theoretical architecture only and explicitly marks Rust runtime validation as unavailable.

---

## 5. Explicit Technology Decision

### Decision:
**Option 3: Defer Rust until a specific verified limitation appears.**

safe-change will remain **100% TypeScript** for all core CLI, installer lifecycle, and agent adapter implementations in Milestone C. An optional Rust helper is deferred until an empirical, reproducible limitation in Node.js filesystem operations is demonstrated in production environments.

### Rationale and Evidence:
1. **Security Adequacy**: All security invariants required by the safe-change threat model (preventing arbitrary overwrites, rejecting symlinks/junctions, enforcing path boundaries, detecting collisions) are proven to be achievable and tested using standard Node.js APIs (108 passing tests).
2. **Distribution and Package Size**: safe-change's value proposition is a lightweight, zero-dependency safety net. Expanding the package from 48.6 kB to tens of megabytes to include multi-platform Rust binaries would degrade the `npx` execution experience without adding functional user value.
3. **Enterprise and CI Compatibility**: Many corporate and locked-down CI environments restrict downloading or executing third-party native binaries. A pure JavaScript/TypeScript package ensures universal compatibility wherever Node.js >= 18 is installed.
4. **Maintenance Sustainability**: Maintaining dual-language CI matrices across Windows, macOS, Linux (GNU), and Alpine Linux (musl) would create substantial ongoing maintenance overhead for a single-engineer project.

### Verified Trigger Conditions for Re-evaluating Rust:
Rust will only be reconsidered if one of the following concrete conditions is empirically proven:
1. A real-world kernel-level TOCTOU exploit against Node.js `fs.lstat` cannot be mitigated within user space on a supported platform.
2. Performance profiling of the repository inspector on repositories with more than 200,000 files demonstrates that Node.js cannot complete baselines within acceptable developer latency (<3 seconds) and a native directory traversal engine is strictly required.
3. Node.js fails to support a required platform-specific locking or security primitive on an operating system targeted for enterprise deployment.
