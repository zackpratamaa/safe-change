<div align="center">

<img width="100%" src="https://raw.githubusercontent.com/zackpratamaa/safe-change/main/assets/banner.png" alt="safe-change banner" />

<br/>

[![Typing SVG](https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=22&duration=2500&pause=1000&color=58A6FF&center=true&vCenter=true&width=750&lines=Record+a+baseline+before+AI+touches+your+code.;Detect+regressions+the+moment+they+happen.;10+agents.+1+install.+Zero+surprises.)](https://github.com/zackpratamaa/safe-change)

<br/>

[![GitHub Sponsors](https://img.shields.io/github/sponsors/zackpratamaa?style=for-the-badge&logo=github&color=EA4AAA&labelColor=0d1117)](https://github.com/sponsors/zackpratamaa)
[![npm version](https://img.shields.io/npm/v/safe-change?style=for-the-badge&logo=npm&color=CB3837&labelColor=0d1117)](https://www.npmjs.com/package/safe-change)
[![npm downloads](https://img.shields.io/npm/dm/safe-change?style=for-the-badge&logo=npm&color=CB3837&labelColor=0d1117)](https://www.npmjs.com/package/safe-change)
[![CI](https://img.shields.io/github/actions/workflow/status/zackpratamaa/safe-change/ci.yml?style=for-the-badge&logo=github-actions&label=CI&labelColor=0d1117)](https://github.com/zackpratamaa/safe-change/actions)
[![License](https://img.shields.io/badge/AGPL--3.0--only-blue?style=for-the-badge&logo=gnu&label=license&labelColor=0d1117)](LICENSE)
[![Node](https://img.shields.io/badge/%3E%3D18.0.0-brightgreen?style=for-the-badge&logo=node.js&label=node&labelColor=0d1117)](https://nodejs.org)

</div>

<br/>

---

<br/>

## Why safe-change exists

Autonomous AI coding agents are rewriting production codebases at unprecedented speed. When you delegate tasks to an AI agent, it touches dozens of files, mutates dependencies, and restructures critical architectural boundaries. The app might still compile and start, but subtle logic has been inverted, authorization guards removed, or regressions silently introduced — leaving developers guessing what broke and why.

Without an authoritative baseline and verifiable execution gates:
- **Regressions become forensic nightmares**: You don't know which agent action broke passing invariant checks.
- **AST semantic drift goes undetected**: Inverted logic conditions, removed safety guards, and swallowed errors bypass superficial diffs.
- **Concurrent multi-agent writes corrupt state**: Uncoordinated agent actions race against each other and your working tree.
- **Enterprise provenance is impossible to prove**: There is zero cryptographic evidence of who authorized, executed, and verified the changes.

**safe-change is the verifiable execution sentinel and high-assurance safety plane for autonomous AI development.**

It locks in cryptographic baselines before AI agents touch your code, isolates execution within OS-backed sandboxes, verifies AST semantic integrity, enforces enterprise change budgets, and generates in-toto RFC 8785 Ed25519-signed attestations — completely air-gapped, zero cloud dependencies, and 100% deterministic.

<br/>

---

<br/>

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
- **Excluded:** Anything matched by `.gitignore` (e.g., `node_modules/`, `dist/`, build artifacts, cache folders) is completely ignored and never hashed. The `.safe-change/` directory is always excluded.
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

> Node.js ≥ 18. No build step. No compiler. No cloud account.

<br/>

---

<br/>

## Quick start

**1. Initialize your project in 1 second**

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

## Commands

| Command | What it does |
|---|---|
| `init` | Auto-detect test runners, create `.safe-change.json` (use `--update-gitignore` to update `.gitignore`) |
| `save [description]` | Record a baseline — runs all checks, hashes all files |
| `check` | Compare current state to baseline — exit 1 if regression |
| `diff [--stat]` | List files added, modified, deleted, and line change stats |
| `assess` | Score change risk, enforce policy, and determine the minimum operating mode |
| `lease acquire <session> <agent>` | Atomically acquire the repository write lease |
| `lease status` | Inspect the active or expired write lease |
| `lease release <session>` | Release a write lease only when session ownership matches |
| `fingerprint` | Capture the current workspace identity and environment digest |
| `fingerprint check` | Compare the current workspace against the baseline fingerprint |
| `evidence <session>` | Create a source-free checksummed evidence bundle |
| `audit verify` | Verify the tamper-evident session event chain |
| `authorize <capability> <resource> <agent> <session> [approval]` | Evaluate an operation through the policy decision and enforcement contract |
| `approval request` | Create a scoped, expiring approval request |
| `approval grant` | Add one independent approval to a request |
| `approval status` | Inspect request integrity, grants, and expiration |
| `policy verify` | Verify the configured detached Ed25519 policy signature |
| `semantic-diff [--base <ref>]` | AST semantic diff analysis for breaking changes and logic mutations |
| `replay record <session> \| verify` | Record or deterministically replay execution sessions across environments |
| `attest create <manifest> \| verify` | Create or cryptographically verify in-toto RFC 8785 Ed25519 attestations |
| `identity keygen \| register \| list` | Manage authorized Ed25519 approver keys in the trust registry |
| `approval sign <req> \| verify` | Cryptographically sign or verify capability requests with Ed25519 |
| `log` | Full history of baselines and check results |
| `dashboard` | Open visual enterprise dashboard at `localhost:4242` |
| `rules list` | Show active safety rules |
| `rules add <id>` | Add a built-in safety rule |
| `rules remove <id>` | Remove a safety rule |
| `install <agent\|all>` | Install skill for a specific agent or all detected agents |
| `update <agent\|all>` | Update installed skill to latest |
| `uninstall <agent\|all>` | Remove installed skill |
| `status [agent]` | Show install status, detected agents, drift |
| `mcp` | Start MCP server on stdio |

All commands accept `--json` for structured output and `--help` for usage details.
Installer commands accept `--scope <project|global>`, `--dry-run`, and `--overwrite`.

<br/>

---

<br/>

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

### Enterprise skill policy

Each installation deterministically combines the canonical safety contract with a validated profile for the selected agent. The policy includes Standard, High Assurance, and Incident modes; microscopic syntax-boundary review; fail-closed evidence rules; prompt-injection boundaries; concurrent-drift detection; test-integrity controls; release gates; and a required verification report.

The ownership manifest records canonical, profile, and composed SHA-256 values. `safe-change status` therefore detects drift in either the shared policy or the agent-specific profile. See [docs/enterprise-skill-policy.md](docs/enterprise-skill-policy.md).

<br/>

---

<br/>

## MCP server

Agents that support the Model Context Protocol can invoke safe-change as a native tool — no SKILL.md, no manual setup, no PATH configuration needed.

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
| `safe_change_check` | Detect regressions after edits |
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

Rule violations with `severity: error` set exit code 1, same as a regression. Built-in rules provide production defaults. Custom thresholds, custom target patterns, or custom check names can be configured by editing `.safe-change/rules.json` or passing a JSON rule file via `safe-change rules add <file.json>`. See [docs/rules.md](docs/rules.md) for full rule condition specifications.

<br/>

---

<br/>

## Local dashboard

```bash
safe-change dashboard
# Dashboard running at http://localhost:4242
# Press Ctrl+C to stop.
```

Fully offline. Binds to `127.0.0.1` only — never exposed to the network.

**Port configuration:**

```bash
# Override via CLI flag
safe-change dashboard --port 8080
```

```json
// Or set in .safe-change.json
{ "dashboardPort": 8080 }
```

If the configured port is already in use, the server exits with an error. Choose an available port and retry.

**Enterprise Architecture & Features:**

- **Brand Mark `/SAFE-CHANGE`**: Minimalist developer-grade typography matching the Apple Liquid Glass design system.
- **6 Hero Metric Cards**: Real-time System State, Monitored Baseline, Enterprise Risk & Mode (0-100 score), Change Budget Bounds, Active Write Lease, and Tamper-Evident Audit & Trust Chain.
- **6 Interactive Segmented Tabs**:
  - `Overview & Baseline`: Baseline status, active rules, interactive regression timeline, and persistent log history.
  - `Enterprise Risk & Budget`: Risk score gauge meter, real-time signal classification, and diff bounds checks.
  - `AST Semantic Security`: Deep AST syntax inspection, breaking export detection, and public API surface protection.
  - `Verifiable Replay & Attestations`: In-toto RFC 8785 Ed25519-signed attestation envelopes and deterministic replay sessions.
  - `Identity & Trust Registry`: Authorized approver identities, public keys, and multi-sig quorum status.
  - `Tamper-Evident Audit Chain`: SHA-256 cryptographic chain integrity verification and immutable audit event stream.
- **Offline Telemetry API**: Read-only JSON endpoints (`/api/status`, `/api/log`, `/api/config`, `/api/rules`, `/api/enterprise`, `/api/lease`, `/api/audit`, `/api/identity`, `/api/verifiable`).
- Full dashboard documentation in [docs/dashboard.md](docs/dashboard.md).

<br/>

---

<br/>

## Safety model

safe-change is built to never be the cause of a regression.

| Guarantee | Detail |
|---|---|
| No silent Git mutations | Never runs `git commit`, `git stash`, `git reset`, or `git clean` |
| No working tree writes | Reads and hashes files only — never modifies your project files |
| No telemetry | Zero outbound network calls. Fully offline. |
| No shell expansion | Commands are spawned directly. No shell interpolation. |
| No AI dependency | No model, no API key, no account required |
| Bounded execution | Configurable timeouts on all check processes |

> **Security Warning — Configuration Trust Boundary:** `.safe-change.json` specifies executable commands and arguments that safe-change invokes during `save` and `check`. While safe-change uses direct process spawning without shell expansion (mitigating shell injection), commands execute with your current user privileges. Treat `.safe-change.json` with the same scrutiny as a `Makefile`, `package.json` scripts, or CI workflow — **never run `safe-change save` or `safe-change check` on untrusted or unreviewed configurations from third-party pull requests.**

See [SECURITY.md](SECURITY.md) for trust boundaries and vulnerability reporting.

<br/>

---

<br/>

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Clean — no new regressions |
| `1` | Regression — at least one previously passing check now fails |
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

## Documentation

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
| [docs/verifiable-execution-architecture.md](docs/verifiable-execution-architecture.md) | High-assurance verifiable execution architecture specification |
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
