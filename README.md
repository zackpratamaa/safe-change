<div align="center">

<img width="100%" src="https://raw.githubusercontent.com/zackpratamaa/safe-change/main/assets/banner.png" alt="safe-change banner" />

<br/>

[![Typing SVG](https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=22&duration=2500&pause=1000&color=58A6FF&center=true&vCenter=true&width=750&lines=Record+a+baseline+before+AI+touches+your+code.;Detect+regressions+the+moment+they+happen.;10+agents.+1+install.+Zero+surprises.)](https://github.com/zackpratamaa/safe-change)

<br/>

[![GitHub Sponsors](https://img.shields.io/github/sponsors/zackpratamaa?style=for-the-badge&logo=github&color=EA4AAA&labelColor=0d1117)](https://github.com/sponsors/zackpratamaa)
[![npm version](https://img.shields.io/npm/v/safe-change?style=for-the-badge&logo=npm&color=CB3837&labelColor=0d1117)](https://www.npmjs.com/package/safe-change)
[![npm downloads](https://img.shields.io/npm/dm/safe-change?style=for-the-badge&logo=npm&color=CB3837&labelColor=0d1117)](https://www.npmjs.com/package/safe-change)
[![CI](https://img.shields.io/github/actions/workflow/status/zackpratamaa/safe-change/ci.yml?style=for-the-badge&logo=github-actions&label=CI&labelColor=0d1117)](https://github.com/zackpratamaa/safe-change/actions)
[![Measured V8 source lines](https://raw.githubusercontent.com/zackpratamaa/safe-change/coverage-reports/coverage.svg)](https://github.com/zackpratamaa/safe-change/blob/coverage-reports/coverage-report.json)
[![License](https://img.shields.io/badge/AGPL--3.0--only-blue?style=for-the-badge&logo=gnu&label=license&labelColor=0d1117)](LICENSE)
[![Node](https://img.shields.io/badge/%3E%3D18.0.0-brightgreen?style=for-the-badge&logo=node.js&label=node&labelColor=0d1117)](https://nodejs.org)

</div>

<br/>

---

<br/>

## Start with save / check / diff

safe-change compares configured checks and Git-visible file inputs before and after edits. It is a local safety net for honest mistakes, not a guarantee that code is correct or secure.

**Experimental developer preview: 1.1.0-preview.1.** This source tree is not a general-availability security certification. A source change is not automatically present in an older npm release. Advanced policy, integrity and signing tools are opt-in and are labeled below.

## How it works

```bash
# Step 1 — Before the agent: lock in a verified baseline
safe-change save "auth and dashboard both passing"

# Step 2 — Let your agent do its work
# ...

# Step 3 — After the agent: detect what regressed
safe-change check

# Step 4 — See which files were touched
safe-change diff
```

```
Baseline: auth and dashboard both passing

Check             Before    Now       Result
─────────────────────────────────────────────
build             pass      pass      ok
unit-tests        pass      fail      REGRESSION
e2e-auth          pass      pass      ok

Files changed since baseline:
  Modified:  8
  Added:     2
  Deleted:   0

Exit 1 — 1 new regression detected.
Previously passing check now fails: unit-tests
```

### What files are tracked and hashed?

safe-change records SHA-256 cryptographic hashes for codebase verification while respecting repository boundaries:

- **Included:** All files tracked by Git (`git ls-files`) plus untracked working-tree files recognized by Git (`git status -uall`).
- **Excluded:** Untracked ignored files are omitted; already tracked files remain included even if an ignore pattern matches them. The `.safe-change/` directory is always excluded.
- **Binary files:** Read as raw binary streams and hashed directly with SHA-256 without distortion or character decoding.
- **Symlinks:** Inspected with `lstat` and hashed by their link target string (`readlink`) without following or dereferencing paths outside the repository.

<br/>

---

<br/>

## Install

```bash
npm install -g safe-change
```

```bash
# Verify
safe-change --version
```

> The package declares Node.js ≥ 18. Clean-package CI currently exercises Node.js 22 and 24; the declared minimum is not a claim of equivalent CI coverage. Java verification additionally requires a JDK. Native binaries are optional; see the preview guide for the tested fallback route.

<br/>

---

<br/>

## Quick start

**1. Initialize and review your project configuration**

```bash
safe-change init
```

> Automatically inspects your repository (Node.js, Rust, Go, Python, Makefile), generates `.safe-change.json` with detected test runners, and optionally updates `.gitignore` when `--update-gitignore` is specified.

**2. Save a baseline before your agent starts**

```bash
safe-change save "before refactor"
```

**3. Check for regressions after your agent finishes**

```bash
safe-change check
```

**4. Inspect what changed (files and line counts)**

```bash
safe-change diff --stat
```

<br/>

---

<br/>

## Local readiness and state integrity (unreleased source)

Run `safe-change doctor --json` to inspect local setup without executing project checks. Start with the [getting-started guide](docs/getting-started.md), [Java verification helper](docs/java-verification.md), and [state storage boundaries](docs/state-storage.md). Source changes are not automatically available in an older npm release.

## Commands

Start with these commands; advanced policy and signing are not prerequisites.

| Command | Purpose |
|---|---|
| `init` | Generate a check configuration; review it before execution |
| `save [description]` | Run configured checks and record a baseline |
| `check` | Compare with the baseline; exit 0 means no new regression, not necessarily verified |
| `check --strict --json` | Require verified status for a delivery gate |
| `diff [--stat]` | Inspect changed files and optional line statistics |
| `doctor --json` | Inspect local readiness without running project checks; not certification |
| `log` | Inspect local baseline/check history |
| `dashboard --no-open` | Start a loopback status dashboard |
| `rules list` | Inspect configured safety rules |
| `install <agent|all>` | Install reviewed skill files for a supported adapter |
| `update <agent|all>` / `uninstall <agent|all>` | Update or remove owned skill files |
| `status [agent]` | Inspect installation state |
| `mcp` | Start the stdio MCP server for a configured client |

Use each command's `--help` for its actual options. Installation is not evidence that an IDE or agent invoked a skill.

## Verification integrity

These changes describe current source. They are not automatically included in an older published npm package; check the approved release/commit.

Use `safe-change check --strict --json` for a verified-only CI/agent gate. Plain
`check` retains its no-new-regression exit contract and can exit 0 with a
`failed` or `not-verified` status. MCP `safe_change_check` supports `strict: true`.

Checks now bind their reports to Git-visible source, baseline, and environment
digests; input mutation during execution invalidates verification. Conventional
test files and configured command scripts are protected from unnoticed changes.
Add custom oracle paths using `protectedVerificationPaths`. Stale evidence is
explicitly downgraded to `not-verified`, and semantic diff includes deletions.

See [Documentation status](docs/documentation-status.md) for current versus historical references.

See [Verification integrity and strict gates](docs/verification-integrity.md)
for migration, conservative test-review behavior, and trust/coverage limits.
These controls do not make unrestricted same-user agent execution tamper-proof.

## Supported agents

```bash
# Detect which agents are installed and set up all of them at once
safe-change install all
```

| Agent | ID | Project scope | Global scope |
|---|---|---|---|
| Google Antigravity | `antigravity` | `.agents/skills/safe-change/` | `~/.gemini/config/skills/safe-change/` |
| Claude Code | `claude-code` | `.claude/skills/safe-change/` | `~/.claude/skills/safe-change/` |
| Cursor | `cursor` | `.cursor/skills/safe-change/` | `~/.cursor/skills/safe-change/` |
| OpenAI Codex | `codex` | `.codex/skills/safe-change/` | `~/.codex/skills/safe-change/` |
| Cline | `cline` | `.cline/skills/safe-change/` | `~/.cline/skills/safe-change/` |
| Kimi Code | `kimi-code` | `.kimi-code/skills/safe-change/` | `~/.kimi-code/skills/safe-change/` |
| Amp | `amp` | `.agents/skills/safe-change/` | `~/.config/agents/skills/safe-change/` |
| OpenCode | `opencode` | `.opencode/skills/safe-change/` | `~/.config/opencode/skills/safe-change/` |
| Gemini CLI | `gemini-cli` | `.gemini/skills/safe-change/` | `~/.gemini/skills/safe-change/` |
| GitHub Copilot | `github-copilot` | `.github/skills/safe-change/` | `~/.github/skills/safe-change/` |

> **Note on verification status:** All listed agents currently ship with `filesystem-validated` status: their adapters are validated for installing, reading, and removing skill files at the expected paths. MCP server tests validate protocol/tool behavior separately; they do not establish live integration with every agent. Per-agent MCP runtime and skill auto-invocation remain **pending evidence** until a reproducible session record is linked in [docs/runtime-verification.md](docs/runtime-verification.md). Muse Code is not yet a listed, runtime-verified integration. If an agent does not pick up the installed skill, please [open an issue](https://github.com/zackpratamaa/safe-change/issues).

### Optional skill policy — Experimental

Each installation combines the canonical safety contract with a validated profile for the selected agent. The policy includes Standard, High Assurance, and Incident modes; microscopic syntax-boundary review; fail-closed evidence rules; prompt-injection boundaries; concurrent-drift detection; test-integrity controls; release gates; and a required verification report.

The ownership manifest records canonical, profile, and composed SHA-256 values. `safe-change status` therefore detects drift in either the shared policy or the agent-specific profile. See [docs/enterprise-skill-policy.md](docs/enterprise-skill-policy.md).

<br/>

---

<br/>

## MCP server

Compatible MCP clients can invoke the configured stdio server. Installation, executable resolution and client configuration are still required; protocol tests do not certify every IDE integration.

```bash
safe-change mcp
```

Add this to your agent's MCP config:

```json
{
  "mcpServers": {
    "safe-change": {
      "command": "safe-change",
      "args": ["mcp"]
    }
  }
}
```

**Exposed tools:**

| Tool | Description |
|---|---|
| `safe_change_save` | Record a baseline before edits |
| `safe_change_check` | Compare after edits; strict:true requires verified status |
| `safe_change_diff` | Get file-level change summary |
| `safe_change_status` | Show current baseline metadata |
| `safe_change_log` | Retrieve project safety history |

Full per-agent setup in [docs/mcp-setup.md](docs/mcp-setup.md).

<br/>

---

<br/>

## Safety rules

Automatically enforce guardrails on every `safe-change check`.

```bash
safe-change rules add no-delete-migrations
safe-change rules add no-modify-lockfile
safe-change rules add max-files-changed
safe-change rules add require-tests-pass
```

| Rule ID | What it enforces |
|---|---|
| `no-delete-migrations` | Blocks deletion of `**/migrations/**` (severity: error) |
| `no-delete-env` | Blocks deletion of `**/.env*` (severity: error) |
| `no-modify-lockfile` | Blocks lockfile modification (severity: warn) |
| `max-files-changed` | Fails or warns when changed files exceed threshold (default: 50, warn) |
| `max-deleted-files` | Blocks bulk accidental deletions (default: 10, error) |
| `require-tests-pass` | Enforces that the check named `"test"` in your config passes (exit code 0, error) |

Rule violations with `severity: error` set exit code 1, same as a regression. Built-in defaults are configurable guardrails, not a production-safety certification. Custom thresholds, custom target patterns, or custom check names can be configured by editing `.safe-change/rules.json` or passing a JSON rule file via `safe-change rules add <file.json>`. See [docs/rules.md](docs/rules.md) for full rule condition specifications.

<br/>

---

<br/>

## Safety model and execution trust

**Experimental preview, not a sandbox against an equal-privilege actor.** An agent or human with the same OS-user permissions can modify or delete `.safe-change/`, including audit state. Review [SECURITY.md](SECURITY.md) before relying on any integrity feature.

- Configured checks are executable code running with your user's privileges unless a separately configured, available isolation provider restricts them. Review `.safe-change.json`, scripts, test oracles and Git configuration before execution.
- The dashboard's local status API is not an outbound telemetry service. Configured checks, package managers, or an opened browser can independently use the network; a loopback bind does not impose host-wide network isolation.
- Baselines are comparisons, not backups. A passing result only covers the configured checks and captured inputs, not every possible regression.
- Direct executable/argument spawning is not a blanket command-injection guarantee; a configured executable can itself be a shell or interpreter.
- Keep independent backups and trusted external records where loss or equal-user tampering matters.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Plain check: no new regressions; strict check: verified status required |
| `1` | New regression/blocking rule, strict non-verified result, or rejected mutating baseline |
| `2` | No baseline found or baseline is corrupt |
| `3` | Configuration error |
| `4` | Not a Git repository |
| `5` | Internal error |
| `6` | Cancelled by user |
| `7` | Collision — use `--overwrite` to proceed |
| `8` | Ownership conflict |
| `9` | Unsupported agent or incompatible target |

<br/>

---

<br/>

## Opt-in advanced policy and integrity layer — Experimental

The core loop above does not require PDP/PEP concepts, signing keys, approval workflows, or enterprise configuration. Enable these mechanisms only after reviewing their configuration and trust boundaries.

### Maturity labels

These labels describe assurance, not whether source code exists. **Experimental** means limited validation and **not yet independently verified**. **Beta** would mean a defined, tested scope with remaining validation gaps. **Stable** additionally requires committed unit and integration coverage, an adversarial test, and a current review of open security issues. No advanced subsystem is assigned Stable or Beta in this pass; absence of such a label is not an assertion that it has no tests.

| Feature / command | Maturity | Important limit |
|---|---|---|
| Risk engine and `assess` | Experimental | A policy score is not a probability of safety or proof of complete regression detection |
| Enterprise policy, budgets and anti-policy-downgrade signals | Experimental | Configured gates and heuristics do not prove every unsafe change is detected |
| Capability decisions and `authorize` | Experimental | A decision is only enforced by a cooperating caller |
| Approval requests, grants, signed approvals and identity registry | Experimental | Local workflow state and key trust require independent review; not authenticated IDE consent |
| Detached policy-root signature and `policy verify` | Experimental | Signature validity is not a review of policy safety or of the trust-root distribution |
| Write lease and workspace fingerprint | Experimental | Cooperative coordination and compared digests, not an OS permission boundary |
| Evidence bundle and `evidence` | Experimental | Local checksums are not an independent witness or a source backup |
| Local audit chain and `audit verify` | Experimental | Local digest consistency is not immutable storage; an equal-privilege writer can replace state |
| AST heuristics and `semantic-diff` | Experimental | Narrow syntactic patterns; rerun the labeled corpus and inspect its known false negatives, not a production-accuracy claim |
| Replay recording, metadata comparison and optional reexecution | Experimental | Matching recorded metadata does not prove reproducible execution of arbitrary programs |
| Ed25519 signing, DSSE/in-toto-shaped envelopes and `attest` | Experimental | Not yet independently reviewed for cryptographic/protocol conformance; verify the exact evidence and trust root |
| Streaming secret-output filter | Experimental | Pattern-based filtering is not complete secret discovery or data-loss prevention |
| Local dashboard and local status API | Experimental | Inspection of local artifacts does not authenticate a producer or establish fresh verification |
| Command allowlist / optional OS sandbox provider | Experimental | Configured commands are trusted code; unavailable isolation must not be treated as a sandbox |

See [SECURITY.md](SECURITY.md), [verification limits](docs/verification-integrity.md), and [verifiable execution usage](docs/verifiable-execution.md). These labels do not announce an external audit or a stabilization period.

### Advanced command reference

| Command | Purpose |
|---|---|
| `assess` | Inspect risk signals and configured budgets |
| `lease acquire <session> <agent>` / `lease status` / `lease release <session>` | Cooperative write coordination |
| `fingerprint` / `fingerprint check` | Record or compare workspace/environment digests |
| `evidence <session>` | Export a checksummed local evidence bundle |
| `audit verify` | Check the remaining local event chain |
| `authorize <capability> <resource> <agent> <session> [approval]` | Return a policy decision for the caller to enforce |
| `approval request` / `approval grant` / `approval status` | Manage local approval workflows |
| `policy verify` | Verify a configured detached policy signature |
| `semantic-diff [--base <ref>]` | Run the supported AST/JSON heuristics |
| `replay record <session>` / `replay verify <file>` | Record/compare metadata; `--reexecute` requests a separate rerun |
| `attest create <session>` / `attest verify <file>` | Sign or verify an evidence statement |
| `identity keygen` / `identity register` / `identity list` | Manage local approver keys |
| `approval sign <req>` / `approval verify` | Sign or verify approval requests |

## Local dashboard and local status API

```bash
safe-change dashboard --no-open
```

The server binds to IPv4 loopback `127.0.0.1`, not an external interface. The read-only local status API consists of `/api/status`, `/api/log`, `/api/config`, `/api/rules`, `/api/enterprise`, `/api/lease`, `/api/audit`, `/api/identity`, and `/api/verifiable`. These are local inspection endpoints, not a telemetry upload service. Their displayed artifacts do not independently certify current source or a fresh verification run.

Binding implementation: [LOCALHOST_HOST and startDashboardServer](src/dashboard/server.ts). Runtime assertion: [Dashboard server — binds only to 127.0.0.1](tests/unit/dashboard-server.test.ts). A loopback bind is not authentication against other local users/processes, nor a guarantee against an operator's reverse proxy or port forwarding.

Set a port with `--port 8080` or `dashboardPort` in `.safe-change.json`. An explicit occupied port is an error. See [dashboard routes and boundaries](docs/dashboard.md).

## Experimental task sessions (unreleased source)

Task-scoped change contracts, interactive verification-timing choices, a separately started polling observer, and cooperative edit/finish gates are available in source. Observation is not verification, and installing a skill does not launch a watcher. The Claude-compatible hook adapter is protocol-tested, not live-IDE certified. See [task sessions](docs/task-sessions.md) and the [nine-repository reference ledger](docs/reference-adaptation.md).

## Experimental quality layer (unreleased source)

`safe-change quality scan --json` runs narrow original code/UI heuristics, not a universal design/security audit. `quality profile` prints reviewed external-tool setup/check templates without installing or running them. `quality report sarif|playwright --file <repo-relative.json>` assesses report contents without authenticating their producer or freshness. `quality gate --file quality-policy.json` is a post-check delivery gate requiring current strict evidence for named checks.

See [usage, exact statuses and trust boundaries](docs/quality-gates.md), [13-repository audit](docs/quality-reference-audit.md), and [policy example](examples/quality/quality-policy.json). ORT/ScanCode/Cosign/Scorecard/CodeQL require project-specific policy integration; scanners and live browser checks are not automatically installed or certified. No source from restricted better-web-ui was copied.

## Developer preview 1.1.0-preview.1

Experimental opt-in preview, not a general-availability safety certification. The guarded [GitHub preview workflow](.github/workflows/preview.yml) publishes a prerelease only after same-commit validation; it does not publish npm packages or replace stable `latest`. Use the GitHub release tarball with `--omit=optional` for the tested TypeScript fallback route. See [installation, actual validation and known gaps](docs/preview-validation.md). Native IDE consent remains unverified.
## Measured verification scope

The coverage badge links to measured V8 source-line coverage with its exact source SHA, Actions run, numerators/denominators, and committed include/exclude configuration. It is published only after the main CI test matrix and tarball smoke test succeed. It is not all-file coverage, an independent review, or a guarantee of security; inspect the report SHA rather than assuming a cached badge represents current HEAD.

- `npm run test:semantic-corpus` builds the actual heuristic engine and reports the confusion matrix, precision and recall for hand-labeled synthetic regression idioms and benign refactors. Known misses remain regression labels in the recall denominator. This small corpus is not a production incident dataset or an independent benchmark.
- `npm run test:replay-corpus` exercises one isolated fixture per declared drift category, plus matching/unsafe-path/preflight counterexamples. Unit fixtures control external Git/execution/capability observations; they do not establish hermetic replay of arbitrary applications.

See [verification rigor and reproducible limits](docs/verification-rigor.md). Advanced mechanisms remain Experimental.

## Documentation

See [how to read validation evidence](docs/validation-evidence.md) for commit-scoped CI proof and the distinction between incomplete runs and passing verification.

| File | Contents |
|---|---|
| [GUIDE.md](GUIDE.md) | Full setup, usage, and troubleshooting |
| [ROADMAP.md](ROADMAP.md) | Shipped milestones and what is next |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [SECURITY.md](SECURITY.md) | Trust model and vulnerability reporting |
| [docs/mcp-setup.md](docs/mcp-setup.md) | MCP configuration per agent |
| [docs/rules.md](docs/rules.md) | Safety rules reference |
| [docs/dashboard.md](docs/dashboard.md) | Local enterprise dashboard reference |
| [docs/verifiable-execution.md](docs/verifiable-execution.md) | Verifiable execution guide (AST semantic diff, replay, attestations, sandbox, identity) |
| [docs/verifiable-execution-architecture.md](docs/verifiable-execution-architecture.md) | Historical verifiable execution architecture specification |
| [docs/persistent-log.md](docs/persistent-log.md) | Persistent safety log |
| [docs/runtime-verification.md](docs/runtime-verification.md) | Multi-agent runtime verification matrix |
| [docs/enterprise-rollout.md](docs/enterprise-rollout.md) | Enterprise rollout and acceptance guide |
| [docs/enterprise-skill-policy.md](docs/enterprise-skill-policy.md) | Canonical policy, composition, assurance modes, and profile invariants |
| [docs/operations-runbook.md](docs/operations-runbook.md) | Operations, incident, and rollback runbook |
| [SUPPORT.md](SUPPORT.md) | Support and severity policy |
| [SECURITY.md](SECURITY.md) | Security policy and reporting |
| [skills/safe-change/SKILL.md](skills/safe-change/SKILL.md) | Canonical agent skill |

<br/>

---

<br/>

## Star history

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=zackpratamaa/safe-change&type=Date)](https://star-history.com/#zackpratamaa/safe-change&Date)

</div>

<br/>

---

<br/>

## Contributors

Thanks to everyone who helps make safe-change better.

<div align="center">

[![Contributors](https://contrib.rocks/image?repo=zackpratamaa/safe-change)](https://github.com/zackpratamaa/safe-change/graphs/contributors)

</div>

Found a regression pattern safe-change missed? A bug in an adapter? Open an [issue](https://github.com/zackpratamaa/safe-change/issues). PRs are welcome for new safety rules, agent adapters, and documentation improvements.

<br/>

---

<br/>

## Sponsor

safe-change is and will always be free and open-source under AGPL-3.0. Sponsorship directly funds maintenance, security patches, and the safe-change Cloud roadmap.

<div align="center">

[![Sponsor safe-change](https://img.shields.io/github/sponsors/zackpratamaa?style=for-the-badge&logo=github&color=EA4AAA&labelColor=0d1117&label=Sponsor%20safe-change)](https://github.com/sponsors/zackpratamaa)

</div>

<br/>

---

<br/>

<div align="center">

<a href="https://github.com/zackpratamaa/safe-change/blob/main/assets/Animating_SAFE-CHANGE_logo_reveal.mp4?raw=true">
  <img width="100%" src="https://raw.githubusercontent.com/zackpratamaa/safe-change/main/assets/logo-reveal.gif" alt="SAFE-CHANGE animated logo reveal" />
</a>

<p align="center">
  <a href="https://github.com/zackpratamaa/safe-change/blob/main/assets/Animating_SAFE-CHANGE_logo_reveal.mp4?raw=true">
    <strong>Watch / Download Full HD Logo Reveal Video (MP4)</strong>
  </a>
</p>

<br/>

*safe-change is a filter, not magic.*
*It clears the noise between what your AI changed and what your codebase lost.*
*The agent does the work. You stay in control.*

</div>

<br/>

---

<br/>

## License

GNU Affero General Public License v3.0 only — SPDX: `AGPL-3.0-only`

See [LICENSE](LICENSE) and [LICENSE_CHANGE.md](LICENSE_CHANGE.md).

**For commercial and enterprise users:** AGPL-3.0 is a strong copyleft license that protects against proprietary hosted cloud forks. **Using safe-change unmodified as a developer CLI tool, MCP server, or in proprietary enterprise CI/CD pipelines does NOT trigger copyleft obligations.** Your proprietary code remains 100% proprietary. Only organizations modifying safe-change and serving it over a network as a hosted SaaS product are required to release their modifications under AGPL-3.0. If your organization requires a commercial license without copyleft obligations, contact the maintainer.

Copyright © 2026 ZACK.PRATAMA — PT ZYNTRIX ARTIFICIAL INTELLIGENCE INDONESIA (SAFE-CHANGE)

<div align="center">

<img width="100%" src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=140&section=footer" />

</div>

