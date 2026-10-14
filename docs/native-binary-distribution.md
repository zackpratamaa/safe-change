# Native Binary Distribution Architecture

This document describes the design and operational procedures for distributing precompiled native Rust binaries for `safe-change` across supported platforms.

---

## 1. Distribution Architecture

`safe-change` utilizes a hybrid architecture:
- **TypeScript CLI Core**: Provides user interaction, argument parsing, baseline state management, Git inspection, diff reporting, and agent skill adapter lifecycle management.
- **Rust Native Extension (`safe-change-native`)**: Implemented via `napi-rs` to provide zero-cost kernel-level primitives for path boundary safety, symbolic link/junction validation, atomic rename, and advisory file locking.
- **Platform Packages (`@safe-change/<platform>`)**: Precompiled native Node.js addons (`.node`) distributed in platform-specific scoped npm packages.

This structure eliminates the need for end users to have a Rust toolchain, C++ compiler, or Python build environment installed on their machines.

---

## 2. GitHub Actions Build and Publish Pipeline

Compilation and testing are automated via continuous integration, while production distribution is orchestrated exclusively by the release pipeline:

1. **Continuous Integration Matrix (`.github/workflows/native-build.yml`)**:
   - The `build-and-test` job executes across four runner environments: `ubuntu-latest` (`linux-x64-gnu`), `windows-latest` (`win32-x64-msvc`), `macos-latest` (`darwin-arm64`), and `macos-15-intel` (`darwin-x64`).
   - Each runner compiles TypeScript, verifies TypeScript fallback (`SAFE_CHANGE_NATIVE_DISABLED=1`), executes Rust unit tests (`cargo test`), builds the native extension via `npx napi build --platform --release`, and verifies the native binary via `scripts/verify-built-native.mjs`.
   - CI runs are strictly non-publishing.

2. **Unified Release Pipeline (`.github/workflows/release.yml`)**:
   - Production publication is triggered only by a pushed SemVer tag. Manual `workflow_dispatch` validates, builds, packages, and verifies the exact release artifacts in dry-run mode; it cannot publish.
   - Executes release validation and npm preflight before initiating build jobs.
   - Compiles native binaries, creates immutable tarballs, verifies their metadata and SHA-256 digest, and publishes those exact tarball files with `--access public --provenance`.
   - Requires all four active native platform packages to be verified visible on the npm registry before publishing the root `safe-change` package.

---

## 3. npm Platform Selection via `optionalDependencies`

`safe-change` leverages standard npm package management behavior:
- Platform packages define target OS and CPU requirements in their respective `package.json`:
  ```json
  {
    "name": "@safe-change/win32-x64-msvc",
    "version": "1.1.0-preview.1",
    "os": ["win32"],
    "cpu": ["x64"],
    "main": "safe-change-native.node"
  }
  ```
- When a user installs `safe-change`, npm inspects the host system against the `optionalDependencies` entries.
- Only the package corresponding to the current host OS and architecture is downloaded.
- If installation fails (or if the user installs with `--no-optional`), npm proceeds without aborting.

---

## 4. Supported Platforms

The following platforms are actively built, tested, and distributed:

| Package Name | Operating System | Architecture | Toolchain / Libc | Distribution Status |
| --- | --- | --- | --- | --- |
| `@safe-change/win32-x64-msvc` | Windows | x64 | MSVC | Active |
| `@safe-change/darwin-x64` | macOS | x64 | Intel / Mach-O | Active |
| `@safe-change/darwin-arm64` | macOS | ARM64 | Apple Silicon | Active |
| `@safe-change/linux-x64-gnu` | Linux | x64 | glibc | Active |

### Planned Platforms

The following platforms have repository package structures prepared but are not actively built or included in root `optionalDependencies` pending dedicated CI builder runners:

| Package Name | Operating System | Architecture | Toolchain / Libc | Status |
| --- | --- | --- | --- | --- |
| `@safe-change/win32-arm64-msvc` | Windows | ARM64 | MSVC | Planned / Experimental |
| `@safe-change/linux-arm64-gnu` | Linux | ARM64 | glibc | Planned / Experimental |
| `@safe-change/linux-x64-musl` | Linux | x64 | musl (e.g. Alpine) | Planned / Experimental |

---

## 5. TypeScript Fallback Mechanism

If no native package is available for the current host environment, or if native execution is explicitly disabled via the `SAFE_CHANGE_NATIVE_DISABLED=1` environment variable:
- The loader in `src/native/index.ts` catches import failures gracefully and returns `null`.
- Core modules ([src/installer/core/path-safety.ts](../src/installer/core/path-safety.ts) and [src/installer/core/transaction.ts](../src/installer/core/transaction.ts)) automatically fall back to pure TypeScript implementations using standard Node.js APIs (`node:fs`, `node:path`).
- All safety guarantees, boundary checks, collision detections, and rollback mechanisms continue to function identically.

---

## 6. Adding a New Target Platform

To add support for a new operating system or architecture:

1. **Add Target to Rust**:
   Configure the target in `crates/safe-change-native/Cargo.toml` and install target via `rustup target add <target>`.
2. **Create npm Platform Directory**:
   Create `npm/<new-platform>/` containing `package.json` specifying `"os"` and `"cpu"`, along with a concise `README.md`.
3. **Update Loader**:
   Add the platform and architecture mapping in `getExpectedPlatformPackage()` in [src/native/index.ts](../src/native/index.ts).
4. **Update CI Workflow**:
   Add the target runner to `.github/workflows/native-build.yml`, the release build matrix in `.github/workflows/release.yml`, and the active target mapping in `scripts/publish-orchestrator.mjs` and `scripts/preflight-npm.mjs`.


---

## 7. Partial Release Recovery

The npm preflight classifies registry state before publication:

- `full`: the root and all native package versions are unpublished.
- `root-recovery`: all native packages are already published and the root package is not. A rerun of the original tag workflow skips immutable native versions and publishes only the exact root tarball artifact.
- `complete`: all package versions are already published; the workflow stops.
- mixed state: only part of the native matrix is published; the workflow fails closed and reports the inconsistent state.

Never change or republish an existing npm version. Recover by rerunning the original tag workflow after confirming the protected `npm-production` environment and registry state. Manual workflow dispatch remains non-publishing.
