# safe-change Roadmap

This document tracks the planned development milestones
for safe-change through v1.0 and subsequent source hardening. Done means implemented in source, not universal security guarantees or live per-agent verification. See [runtime evidence](docs/runtime-verification.md) and [verification boundaries](docs/verification-integrity.md).

Status labels: Done | In Progress | Planned

---

## Next increment — Task-aware agent supervision (Unreleased)

- Implemented in source: literal change contracts, expiring verification-timing choices, durable task state, foreground observation with heartbeat health, scope/protected-input gates and current-evidence binding.
- Experimental: Claude-compatible edit/stop hook output; protocol/CLI tests only. No live IDE or universal hook enforcement claim.
- Planned: authenticated native consent UI, automatic reviewed per-host integration, watcher supervision, specialized code/security/license quality modules, UI/UX contract evaluation, performance/cost budgets and Meta integration.
- [Usage and boundaries](docs/task-sessions.md); [reference provenance](docs/reference-adaptation.md).

## Quality increment (Unreleased, partial)

- Implemented: limited original AST/UI heuristics; current-evidence required-check gate; conservative SARIF and Playwright report-only assessment; inert scanner templates and setup-required profiles.
- Not completed: specialized cross-language maintainability analysis, full UI/UX contract parser, live browser/axe certification, cross-platform certification of external scanners, project-specific ORT/ScanCode license policy, Cosign identity/attestation policy and Scorecard/CodeQL findings policy.
- Preview evidence: pinned Linux scanner fixtures, clean package/stdio MCP/hook smoke, Chromium desktop/mobile checks and scoped axe results. Not a live IDE consent certification.
- No automatic IDE activation in consumer projects. [Usage and boundaries](docs/quality-gates.md); [pinned audit](docs/quality-reference-audit.md).

## v0.1.0 -- Core CLI (Done)

- save, check, diff commands
- Baseline management with atomic writes
- Configuration drift detection
- Symlink boundary enforcement
- Canonical Agent Skill (SKILL.md)
- Antigravity installer
- Full test suite, CI on Ubuntu/macOS/Windows

## v0.1.1 -- Multi-Agent Support (Done)

- Support for 10 AI coding agents:
  Antigravity, Claude Code, Cursor, Codex, Cline,
  Kimi Code, Amp, OpenCode, Gemini CLI, GitHub Copilot
- BaseAdapter class
- safe-change install all command
- Agent auto-detection via detectInstalledAgents
- Collision detection for shared skill paths
- Antigravity runtime verification protocol
- Native binary distribution architecture

## v0.1.2 -- MCP Server (Done)

- Expose safe-change as a Model Context Protocol server
- Tools: safe_change_save, safe_change_check,
  safe_change_diff, safe_change_status, safe_change_log
- stdio transport; clients must configure the server and launch environment
- Generic stdio server setup and evidence requirements; vendor-specific client setup requires current vendor documentation
- Compatible clients can invoke tools without SKILL.md; live per-agent routes remain pending evidence

## v0.2.0 -- Safety Observability & Guardrails (Done)

- Persistent Safety Log: full baseline and verification history
  stored in .safe-change/log.json
- safe-change log command with --last, --all, --json,
  --export, and --clear options
- safe_change_log MCP tool for agent access to local history
- Local Dashboard at localhost:4242 via safe-change dashboard
- 4 Dashboard panels: System State, Monitored Baseline,
  Regression Timeline stream, and Safety Guardrails
- Safety Rules Registry: safe-change rules list/add/remove/validate
- Zero-dependency platform-aware rule evaluation engine
- 6 built-in rules: no-delete-migrations, no-delete-env,
  no-modify-lockfile, max-files-changed,
  max-deleted-files, require-tests-pass
- Blocking rule violations with exit code 1 and warning rules
  integrated into safe-change check and safety log

## v0.3.0 -- Developer Ergonomics & Monorepo Synchronization (Done)

- safe-change init with multi-ecosystem test runner auto-detection
- safe-change diff --stat line change statistics calculation
- Multi-agent runtime verification matrix and test specifications
- Commercial AGPL-3.0 copyleft boundaries clarified
- Unified version synchronization across Rust crate and 7 npm platform packages

## v1.0.0 -- Historical advanced feature rollout (Experimental)

All subsystems in this historical block are Experimental and not yet independently verified. Implemented does not mean production-stable; no soak period is asserted. See [maturity labels](README.md#opt-in-advanced-policy-and-integrity-layer--experimental).

- Risk scoring engine (0-100) and automatic operating-mode selection (Done)
- Machine-readable enterprise policy and change-budget enforcement (Done)
- Anti-policy-downgrade detector and fail-closed approval gate (Done)
- AST semantic diff engine with TypeScript/JavaScript & JSON parsers (Done)
- Multi-agent atomic write leases and workspace fingerprint engine (Done)
- Checksummed evidence bundles and tamper-evident SHA-256 audit chain (Done)
- In-toto RFC 8785 Ed25519 cryptographic attestations and deterministic replay (Done)
- Streaming secret-output blocker for credentials, tokens, and keys (Done)
- Capability-based agent permissions and PDP/PEP authorization (Done)
- Command timeout/process-tree controls and optional environment allowlisting (Done); default inheritance and provider isolation limits remain documented
- Ed25519 approval identity trust registry and multi-party signing (Done)
- Enterprise Liquid Glass Dashboard with `/SAFE-CHANGE` brand mark, 6 Hero Metrics, and 6 Segments (Done)
- Embedded read-only local status API endpoints (Implemented; Experimental)
- Four targets configured in active native CI and root optional dependencies: linux-x64-gnu, win32-x64-msvc, darwin-arm64 and darwin-x64. Additional package manifests alone do not establish working distribution.
- Security policy and release workflow source exist; support-version drift, independently reviewed security assurance and release-specific evidence require separate validation.

---

Maintained by ZACK.PRATAMA
PT ZYNTRIX ARTIFICIAL INTELLIGENCE INDONESIA (SAFE-CHANGE)
License: AGPL-3.0-only
