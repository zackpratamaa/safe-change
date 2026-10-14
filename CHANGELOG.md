# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Documentation
- Align operational guides with strict verification, source/index coverage, branch fingerprints, actual replay/identity/attestation syntax, sandbox limits, and five MCP tools.
- Mark seven research/design snapshots as historical; remove machine-specific links and unverified universal vendor configuration claims.
- Add documentation-contract tests for CLI examples, local links, strict gates, replay category coverage, and canonical skill parity.


### Fixed
- Bind persisted verification and evidence to Git-visible source, the full baseline, and environment digests; downgrade stale or legacy unbound reports.
- Reinspect inputs after checks and reject verification/baseline creation when inputs mutate during execution.
- Guard conventional test paths and repository-local command scripts from unreviewed drift; support custom `protectedVerificationPaths` globs.
- Include deleted source in semantic diff and emit critical deletion findings; reject invalid comparison bases.
- Atomically replace verification summaries.

### Added
- Experimental `quality` CLI: original limited AST/UI audit, current-evidence named-check delivery gate, strict SARIF/Playwright report-only assessment, and inert external-scanner profiles.
- Pinned 13-repository license/installer audit and explicit setup-required compliance/provenance boundaries; no scanner installers, runtime dependencies or restricted source vendored.
- Experimental `session` lifecycle: change contracts, expiring human timing choice, observer heartbeat, scope/oracle gates, and binding to existing verification evidence.
- Interactive-only timing-choice command; no agent-facing MCP consent setter. This is cooperative workflow state, not authenticated human approval.
- Claude-compatible hook output adapter with explicit protocol-only validation limits; no automatic hook installation.
- Nine-repository research provenance and delivery-boundary ledger; no vendored reference frameworks or license change.
- `check --strict` and MCP `safe_change_check` `strict: true` for a verified-only gate, while preserving legacy plain-check exit behavior and replay's strict alias.
- Regression coverage for stale evidence, source mutation, oracle weakening, configuration removal, fail-fail gate behavior, and deletion.
- Explicit verification-integrity documentation covering migration and cooperative trust boundaries.

## [1.0.0] - 2026-09-29

### Added
- Executable enterprise risk engine with deterministic 0-100 scoring and Standard, Enhanced, High Assurance, and Critical Change mode selection.
- `safe-change assess` command for baseline-aware risk classification, change-budget enforcement, mandatory evidence configuration, and approval gating.
- Machine-readable `enterprisePolicy` configuration with fail-closed constants that reject force-push and destructive-Git enablement.
- Anti-policy-downgrade detection for skipped tests, removed assertions, weakened coverage, `continue-on-error`, disabled security/provenance checks, floating GitHub Action references, and force-push commands.
- Enterprise enforcement documentation and unit coverage for risk boundaries, mode floors, budget dimensions, mandatory gates, and destructive-policy rejection.
- Atomic multi-agent write leases with session ownership, expiration, baseline identity, starting HEAD, and workspace-fingerprint binding.
- Workspace fingerprints covering Git HEAD, branch, hashed remote identity, configuration, rules, lockfiles, policy, canonical skill, agent profile, Node.js version, operating system, and architecture.
- Source-free evidence bundles with baseline, diff, verification, environment, manifest, SHA-256 checksums, and aggregate evidence digest.
- Tamper-evident append-only audit events linked by sequence number, previous digest, payload digest, and event digest.
- Streaming secret-output blocker for GitHub and npm tokens, private keys, cloud access keys, authorization headers, credentialed connection strings, and generic secret assignments.
- Integrity commands: `lease`, `fingerprint`, `evidence`, and `audit verify`.
- Capability-based agent authorization with explicit allow, deny, resource scope, expiration, and default-deny policy.
- Policy Decision Point and Policy Enforcement Point command contract through `safe-change authorize`.
- Expiring multi-party approval requests with distinct approvers, self-approval prevention, operation binding, request digests, and tamper-evident grant chains.
- Command sandbox enforcing executable allowlists, denied arguments, environment-variable allowlists, bounded output, direct process spawning, and fail-closed unsupported network-denial requests.
- Detached Ed25519 policy-root verification with policy digest binding and configuration-level fail-closed enforcement when signatures are mandatory.
- Enforcement commands: `authorize`, `approval request|grant|status`, and `policy verify`.
- AST Semantic Diff Engine with TypeScript/JavaScript and JSON adapters, detecting unary negation inversion, guard removals, test skipping/weakening, catch block error swallowing, and semantic AST mutations.
- Deterministic Replay Subsystem recording execution sessions, environment snapshots, toolchain digests, and verifying zero-drift across 13 distinct drift categories.
- Cryptographic Attestation Framework implementing RFC 8785 JSON Canonicalization Scheme (JCS) and Ed25519 DSSE (Dead Simple Signing Envelope) in-toto attestations over verification evidence.
- OS-Backed Command Sandbox with direct Node.js/npm executable resolution (preventing CVE-2024-27980 and command injection), process tree termination, temporary home isolation, and scrubbed environment allowlists.
- Verifiable Execution commands: `semantic-diff`, `replay`, `attest`, `identity`, `approval sign`, and `approval verify`.
- Enterprise Liquid Glass Dashboard with developer-grade `/SAFE-CHANGE` brand mark, 6 responsive hero metric cards (System State, Monitored Baseline, Enterprise Risk & Mode, Change Budget, Active Write Lease, and Audit & Trust), and 6 interactive segmented tabs (Overview & Baseline, Enterprise Risk & Budget, AST Semantic Security, Verifiable Replay & Attestations, Identity & Trust Registry, and Tamper-Evident Audit Chain).
- Zero-dependency embedded REST telemetry API endpoints: `/api/enterprise`, `/api/lease`, `/api/audit`, `/api/identity`, and `/api/verifiable`.

## [0.3.1] - 2026-09-29

### Added
- Enterprise agent skill policy with Standard, High Assurance, and Incident operating modes, microscopic token-level review, fail-closed stop conditions, prompt-injection boundaries, concurrent-drift controls, test-integrity protections, release gates, and a mandatory evidence report.
- Deterministic per-agent skill composition for all 10 supported coding agents, with canonical, profile, and composed SHA-256 metadata recorded in ownership manifests.
- Strict agent profile inventory, composition regression tests, policy schema, and enterprise skill architecture documentation.
- Native binary load and smoke verification script `scripts/verify-built-native.mjs` executing in GitHub Actions.
- Comprehensive verification state matrix tests covering `pass-pass`, `fail-pass`, `pass-fail`, `fail-fail`, timeout permutations, zero checks, and configuration drift.
- Fail-closed rules tests asserting rejection of missing version, unsupported version, and malformed rule objects.
- Bounded tail buffer unit tests verifying strict memory caps on large MCP output streams.
- Version parity verification check mode (`--check`) in `scripts/sync-version.mjs` and dedicated regression test suite.
- Unified release orchestrator workflow `.github/workflows/release.yml` with OIDC provenance, concurrency protection, and manual dry-run dispatch.
- Release metadata and tag validation tool `scripts/validate-release.mjs` and npm credential/version preflight script `scripts/preflight-npm.mjs`.
- Ordered native-first and root-last publication orchestrator `scripts/publish-orchestrator.mjs` with registry visibility polling.
- Enterprise rollout guide, operations runbook, support policy, code of conduct, and repository CODEOWNERS.
- CycloneDX software bill of materials generation in CI and release artifacts.

### Changed
- Skill installation now appends a validated agent-specific profile while preserving byte-for-byte legacy behavior when no profile exists; status checks detect drift in either the canonical policy or profile.
- Hardened production release policy so only pushed SemVer tags can publish; manual dispatch is permanently non-publishing.
- Release publication now uses exact verified tarball files with SHA-256 reporting instead of publishing from a fresh source directory.
- npm preflight now distinguishes full release, safe root recovery, completed release, and unsafe mixed registry states.
- Re-enabled bounded Dependabot pull requests for npm, Cargo, and GitHub Actions ecosystems.
- Explicit `.gitignore` management: `safe-change init` preserves user `.gitignore` by default; updates to `.gitignore` now strictly require the explicit `--update-gitignore` flag.
- Verification status correctness: Resolved false-positive `verified` status on pre-existing check failures (`fail-fail`, `fail-timeout`, `timeout-fail`, `timeout-timeout`); verification state now reports `failed` with diagnostic reason while keeping exit code 0 to maintain regression exit-code contracts.
- Fail-closed rules evaluation on `save`: `safe-change save` validates `rules.json` schema and version (only version 1 is supported); invalid or malformed rules abort baseline creation with exit code 3 (`CONFIG_ERROR`) without leaking absolute filesystem paths.
- Bounded MCP subprocess output: Replaced unbounded array chunk buffering in MCP server with `BoundedTailBuffer`, capping stdout and stderr memory growth during command execution while retaining trailing diagnostic tails.
- Native distribution alignment: Aligned active binary distribution and `optionalDependencies` to the four fully built and tested targets (`linux-x64-gnu`, `win32-x64-msvc`, `darwin-arm64`, `darwin-x64`).
- CI hardening: Pinned `dtolnay/rust-toolchain` to immutable commit SHA `6bed0761d98439e5a578e2877258200ad565ba87` in GitHub Actions and added post-build native module load verification steps.
- Removed private filesystem URI references across documentation.

## [0.3.0] - 2026-09-28

### Added
- safe-change init command: auto-detects test runners across Node.js,
  Rust (Cargo), Go, Python, and Makefile, creates .safe-change.json,
  and adds .safe-change/ to .gitignore automatically
- safe-change diff --stat flag: computes and displays line-level additions
  and removals for working tree changes relative to baseline
- Multi-agent runtime verification matrix in docs/runtime-verification.md
  with test specifications for all 10 supported AI coding agents
- Version synchronization tooling via scripts/sync-version.mjs and
  npm run version:sync script to maintain monorepo parity across
  root package, crates/safe-change-native, and npm platform packages

### Changed
- Clarified commercial AGPL-3.0 copyleft boundaries in README.md:
  unmodified CLI, MCP server, and CI/CD usage does not trigger copyleft
- Synchronized crates/safe-change-native/Cargo.toml and all 7 platform
  packages under npm/ to version 0.3.0
- Updated local dashboard badge to v0.3.0

## [0.2.0] - 2026-09-28

### Added
- Persistent safety log: full baseline and check history
  stored in .safe-change/log.json
- safe-change log command with --last, --all, --json,
  --export, --clear options
- safe_change_log MCP tool for agent access to history
- Local dashboard at localhost:4242 via safe-change dashboard
- Dashboard panels: current status, log history,
  regression timeline, active rules
- Safety rules registry: safe-change rules list/add/remove/validate
- Rule engine with zero external dependencies
- 6 built-in rules: no-delete-migrations, no-delete-env,
  no-modify-lockfile, max-files-changed,
  max-deleted-files, require-tests-pass
- Rule violations with severity error set exit code 1
- Rule violations integrated into safe-change check output

### Changed
- safe-change check now evaluates active rules after checks
- safe-change save now appends to persistent log
- Repository URLs updated to github.com/zackpratamaa/safe-change

## [0.1.2] - 2026-09-28

### Added
- MCP Server via safe-change mcp subcommand
- Tools: safe_change_save, safe_change_check,
  safe_change_diff, safe_change_status
- stdio transport for zero-config MCP integration
- Agent setup documentation in docs/mcp-setup.md
- Project roadmap in ROADMAP.md

### Changed
- @modelcontextprotocol/sdk added as dependency

## [0.1.1] - 2026-09-27

### Added
- Support for 9 additional AI coding agents:
  Claude Code, Cursor, Codex, Cline, Kimi Code,
  Amp, OpenCode, Gemini CLI, GitHub Copilot
- BaseAdapter class for consistent adapter architecture
- safe-change install all command
- Auto-detection of installed agents via detectInstalledAgents
- Collision detection and warning for agents sharing skill paths
- Runtime verification plan for Antigravity
- Enhanced SKILL.md with automatic invocation guidance
- Native binary distribution architecture via @safe-change/* packages
- GitHub Actions pipeline for automated binary publishing

### Changed
- AntigravityAdapter refactored to use BaseAdapter
- CLI help text updated with all supported agents

### Security
- Path safety enforced for all 10 agent installation paths
- Ownership manifest tracks which agent installed the skill

## [0.1.0] - 2026-09-25

### Added
- Core CLI: save, check, diff commands
- Baseline management with atomic writes and schema versioning
- Configuration drift detection with 11-state result matrix
- Symlink boundary enforcement
- Prototype-safe file tracking for special filenames
- Canonical Agent Skill (skills/safe-change/SKILL.md)
- Antigravity filesystem fixture with path safety hardening
- Antigravity production installer
- Path safety, collision detection, ownership manifest, atomic transaction, and rollback modules
- Interactive and non-interactive installer modes
- Dry-run support
- Exit codes 0-9
- Agent compatibility research documentation
- Installer architecture documentation
- Technology evaluation: TypeScript with deferred Rust

### Security
- Home directory boundary protection
- Symlink and junction rejection
- TOCTOU mitigation via lstat-before-write
- Atomic staging with rollback on failure
- Ownership manifest for safe update and uninstall
