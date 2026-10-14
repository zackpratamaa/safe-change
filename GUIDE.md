# Guide

A beginner-friendly source guide. New main-branch features are not automatically in older npm releases. Confirm the approved version/commit; see [Verification integrity](docs/verification-integrity.md).

## What safe-change is

safe-change is a command-line tool that helps you track the state of your project before and after an AI coding agent makes changes. It answers: did anything that was working before just break?

It works locally in a Git repository. It does not require a cloud account, AI API key, or internet connection.

## Key concepts

**CLI**: The core program you run in a terminal. It inspects Git state, runs your configured checks, saves baselines, and compares results. This is the actual engine.

**Configuration**: A `.safe-change.json` file in your project root that lists the verification commands you want to track.

**Baseline**: A snapshot of your project state (file hashes, check results) at a point in time. Saved to `.safe-change/baseline.json`.

**Check**: A verification command (build, test, lint) that safe-change runs and tracks. Defined in your configuration with an explicit executable and arguments array.

**Agent Skill**: An instruction file that teaches a coding agent when and how to invoke the safe-change CLI. A skill alone cannot run checks; it needs the CLI installed. The canonical skill is implemented at [skills/safe-change/SKILL.md](skills/safe-change/SKILL.md).

**Plugin**: An agent-specific package that bundles skills, rules, or configurations.

**Installer**: Built-in CLI commands (`install`, `update`, `uninstall`, `status`) to safely manage agent skills in project or global scopes. Supports 10 AI coding agents (Antigravity, Claude Code, Cursor, Codex, Cline, Kimi Code, Amp, OpenCode, Gemini CLI, GitHub Copilot) with filesystem-validated status.

## Setup

### Prerequisites

- Node.js 18 or later
- Git
- A Git repository (safe-change requires one)

### Install from source

```bash
git clone https://github.com/zackpratamaa/safe-change.git
cd safe-change
npm install
npm run build
```

To use `safe-change` as a command, either:
- Run directly: `node /path/to/safe-change/dist/cli.js`
- Or link globally: `npm link` (from the safe-change directory)

### Native binary (optional)

The optional Rust module supplies native helpers and platform packages. Verify availability of the exact approved version rather than assuming registry publication from this guide. Local native builds need Rust; end users can use the TypeScript fallback without Rust.

### Configure your project

Create a `.safe-change.json` file in your project root:

```json
{
  "version": 1,
  "checks": [
    {
      "name": "build",
      "executable": "npm",
      "args": ["run", "build"],
      "timeout": 60
    },
    {
      "name": "test",
      "executable": "npx",
      "args": ["vitest", "run"],
      "timeout": 120
    }
  ]
}
```

Each check has:
- `name`: a human-readable label
- `executable`: the program to run (spawned directly, not via a shell)
- `args`: array of arguments passed to the executable
- `timeout`: seconds before the check is killed (default: 60)

If you need shell features like pipes or globbing, create a wrapper script and point the executable at that script.

### Add .safe-change/ to .gitignore

safe-change stores its state in `.safe-change/`. Add it to your `.gitignore`:

```
.safe-change/
```

safe-change will warn you if this is missing but will never modify your `.gitignore` for you.

## Usage workflow

### 1. Save a baseline

Before an agent makes changes:

```bash
safe-change save "login and dashboard work"
```

This records:
- Every tracked file in the Git index (`git ls-files`) with its SHA-256 hash
- Every untracked file recognized by Git (`git status -uall`) with its SHA-256 hash
- The results of all configured checks
- Git state (branch, commit, clean/dirty status)

**Coverage and hashing boundaries:**
- Untracked ignored files are omitted. Files already tracked by Git remain included even when an ignore pattern matches them.
- The `.safe-change/` directory is always excluded.
- Binary files are read as raw binary buffers and hashed directly with SHA-256.
- Symbolic links are hashed by their link target string (`readlink`) without following or dereferencing targets outside repository boundaries.

**Security Note:** `.safe-change.json` defines executable commands. Never run `safe-change save` or `check` on untrusted repositories or pull requests before reviewing `.safe-change.json`.

It works with dirty working trees. It never commits, stashes, or resets anything.

### Branch-switching behavior

A baseline is a point-in-time snapshot of the current working tree and check results. It records the Git branch and commit and includes a workspace fingerprint. A branch mismatch is reported and fingerprint drift prevents verified status. If you `save` a baseline on `feature/auth`, then switch to `main`, then run `check`, the comparison will run against the `main` working tree using a baseline that was recorded on `feature/auth`. The results may be misleading because the file contents differ between branches for reasons unrelated to any agent's work.

Best practice: stay on the baseline branch. After switching branches, investigate drift and review the intended state before explicitly accepting another baseline; do not automatically rebaseline to hide a failure.

### 2. Let the agent work

Use Cursor, Claude Code, Codex, Antigravity, or any other tool.

### 3. Check for regressions

```bash
safe-change check --strict
```

This re-runs your configured checks and compares results against the baseline. It reports:
- New failures (things that were passing and now fail)
- Fixed checks (things that were failing and now pass)
- Pre-existing failures (things that were already broken)
- Configuration drift (checks added or removed since baseline)
- File changes (added, modified, deleted)

### 4. Review changes

```bash
safe-change diff
```

Shows a summary of file changes (added, modified, deleted, unchanged). Exact line diffs from baseline are unavailable because safe-change records integrity hashes rather than full file contents to protect privacy. Run `git diff` to inspect uncommitted changes in your working tree.

### 5. Use JSON output

Add `--json` to any command for structured output:

```bash
safe-change check --strict --json
```

## Using with Coding Agents

safe-change provides a canonical Agent Skill at [skills/safe-change/SKILL.md](skills/safe-change/SKILL.md).

When working with an AI coding agent:
1. Provide the skill instructions to the agent.
2. The agent checks if the CLI is available via `safe-change --version`.
3. If available, the agent follows the safety workflow:
   - `safe-change save "<description>"` before risky edits.
   - `safe-change check --strict` immediately after modifications to catch regressions.
   - `safe-change diff` when a file change summary is needed.
4. The skill instructs the agent to follow non-negotiable safety rules; it is not an OS enforcement boundary: the agent is forbidden from running `git commit`, `git stash`, `git reset`, `git clean`, or `git checkout`, preserving all uncommitted work.

## Agent Skill Installer

safe-change includes production installer commands to manage agent skills.
The current source ships filesystem adapters for 10 AI coding agents: Antigravity, Claude Code, Cursor, Codex, Cline, Kimi Code, Amp, OpenCode, Gemini CLI, and GitHub Copilot.
Status for all agents: **filesystem-validated** (verified at filesystem level; runtime verification in subsequent versions).

### Supported Agents and Installation Paths

| Agent | Agent ID | Project Path | Global Path |
| --- | --- | --- | --- |
| Claude Code | `claude-code` | `<workspaceRoot>/.claude/skills/safe-change/` | `~/.claude/skills/safe-change/` |
| Cursor | `cursor` | `<workspaceRoot>/.cursor/skills/safe-change/` | `~/.cursor/skills/safe-change/` |
| Codex | `codex` | `<workspaceRoot>/.codex/skills/safe-change/` | `~/.codex/skills/safe-change/` |
| Cline | `cline` | `<workspaceRoot>/.cline/skills/safe-change/` | `~/.cline/skills/safe-change/` |
| Kimi Code | `kimi-code` | `<workspaceRoot>/.kimi-code/skills/safe-change/` | `~/.kimi-code/skills/safe-change/` |
| Amp | `amp` | `<workspaceRoot>/.agents/skills/safe-change/` | `~/.config/agents/skills/safe-change/` |
| OpenCode | `opencode` | `<workspaceRoot>/.opencode/skills/safe-change/` | `~/.config/opencode/skills/safe-change/` |
| Gemini CLI | `gemini-cli` | `<workspaceRoot>/.gemini/skills/safe-change/` | `~/.gemini/skills/safe-change/` |
| GitHub Copilot | `github-copilot` | `<workspaceRoot>/.github/skills/safe-change/` | `~/.github/skills/safe-change/` |
| Antigravity | `antigravity` | `<workspaceRoot>/.agents/skills/safe-change/` | `~/.gemini/config/skills/safe-change/` |

> Note: Amp and Antigravity share the `.agents/skills/` directory at project scope. The installer detects this collision and issues an informational warning:
> `"amp dan antigravity berbagi direktori .agents/skills/. Keduanya akan membaca skill yang sama."`
> The installation succeeds safely without failing or corrupting ownership.

### Per-Agent Installation Instructions

#### Claude Code (Anthropic)
```bash
# Project scope
safe-change install claude-code

# Global scope
safe-change install claude-code --scope global
```
The installer manages these filesystem paths. Confirm discovery/reload behavior with the installed client; live invocation remains pending evidence in [runtime-verification.md](docs/runtime-verification.md).

#### Cursor (Anysphere)
```bash
# Project scope
safe-change install cursor

# Global scope
safe-change install cursor --scope global
```
The installer manages these filesystem paths. Confirm discovery/reload behavior with the installed client; live invocation remains pending evidence in [runtime-verification.md](docs/runtime-verification.md).

#### OpenAI Codex
```bash
# Project scope
safe-change install codex

# Global scope
safe-change install codex --scope global
```
The installer manages these filesystem paths. Confirm discovery/reload behavior with the installed client; live invocation remains pending evidence in [runtime-verification.md](docs/runtime-verification.md).

#### Cline
```bash
# Project scope
safe-change install cline

# Global scope
safe-change install cline --scope global
```
Installed into `.cline/skills/safe-change` following Cline's skill structure.

#### Kimi Code (Moonshot AI)
```bash
# Project scope
safe-change install kimi-code

# Global scope
safe-change install kimi-code --scope global
```
Installed into `.kimi-code/skills/safe-change`.

#### Amp (Sourcegraph)
```bash
# Project scope
safe-change install amp

# Global scope
safe-change install amp --scope global
```
At project scope, Amp shares `.agents/skills/` with Antigravity. Global scope installs into `~/.config/agents/skills/safe-change`.

#### OpenCode
```bash
# Project scope
safe-change install opencode

# Global scope
safe-change install opencode --scope global
```
Follows the Agent Skills standard with global configuration at `~/.config/opencode/skills/safe-change`.

#### Google Gemini CLI
```bash
# Project scope
safe-change install gemini-cli

# Global scope
safe-change install gemini-cli --scope global
```
Legacy configuration directory. Antigravity supersedes Gemini CLI for full agent workflows.

#### GitHub Copilot
```bash
# Project scope
safe-change install github-copilot

# Global scope
safe-change install github-copilot --scope global
```
Installed into `.github/skills/safe-change` (also compatible with `.agents/skills/`).

#### Google Antigravity
```bash
# Project scope
safe-change install antigravity

# Global scope
safe-change install antigravity --scope global
```
The installer writes those project/global paths; actual discovery and automatic invocation remain pending runtime evidence.

### Installing All Agents (`install all`)

To install safe-change for all agents present in a project at once:

```bash
safe-change install all [--scope project|global] [--dry-run]
```

The installer runs auto-detection (`detectInstalledAgents`):
- If one or more agent configuration directories (`.claude/`, `.cursor/`, `.codex/`, `.cline/`, `.kimi-code/`, `.agents/`, `.opencode/`, `.gemini/`, `.github/`) exist in the workspace, safe-change installs into each detected agent.
- If no agent directories are detected, safe-change installs into all 10 supported agents.

### Dry-Run Simulation

Adding `--dry-run` performs full path validation, collision inspection, and SHA-256 calculation without writing to disk or creating directories:

```bash
safe-change install claude-code --dry-run
safe-change install all --dry-run
```

### Collision and Ownership Protection

The installer provides strict guarantees to prevent data loss or unintended overwrites:

- **Up-to-Date Recognition**: If the target skill already contains byte-identical content and is owned by safe-change, the installer reports `up_to_date` without modifying disk timestamps.
- **Collision Detection**: If the target contains differing content, the installer will not overwrite silently. In interactive mode, it prompts for confirmation (`y/N`). In non-interactive mode (`--non-interactive`), it fails with exit code 7 unless `--overwrite` is explicitly provided.
- **Ownership Manifest**: Installations write `.safe-change-manifest.json` recording the version, owning agent, scope, and SHA-256 hashes of installed files.
- **Uninstall Safety**: `safe-change uninstall` validates ownership before removing files. If untracked foreign files are present in the target directory, uninstallation aborts with exit code 7 to protect user files.
- **Symlink / Junction Rejection**: Targets or canonical sources that are symbolic links or junctions are rejected with exit code 9 (`INCOMPATIBLE_TARGET`).

### Exit Codes Reference

| Code | Label | Meaning |
| --- | --- | --- |
| 0 | `OK` | Plain check: no new regressions. Strict check: verified status required. |
| 1 | `NEW_FAILURE` | Regression/blocking rule, strict non-verified result, or rejected mutating baseline. |
| 2 | `NO_BASELINE` / `STATE_ERROR` | State error / No baseline found or target not installed. |
| 3 | `CONFIG_ERROR` | Configuration or argument parsing error. |
| 4 | `NOT_GIT_REPO` | Not a Git repository (required for project operations). |
| 5 | `INTERNAL_ERROR` | Unhandled internal exception. |
| 6 | `OPERATION_CANCELLED` | Operation cancelled by user prompt rejection. |
| 7 | `COLLISION_DETECTED` | Existing differing content; explicit `--overwrite` required. |
| 8 | `OWNERSHIP_CONFLICT` | Target directory is not owned by safe-change. |
| 9 | `INCOMPATIBLE_TARGET` | Incompatible target path or unsupported agent. |

## Troubleshooting

### "Not a Git repository"

safe-change requires a Git repository. Initialize one with `git init` if needed.

### "Configuration file not found"

Create a `.safe-change.json` file in your project root. See the configuration section above.

### "No baseline found"

Run `safe-change save` before running `safe-change check --strict`.

### "Baseline file is corrupt"

Delete `.safe-change/baseline.json` and run `safe-change save` again.

### "Unsupported baseline schema version"

The baseline was created by a different version of safe-change. Delete it and create a new one.

### A check times out

Increase the `timeout` value in your `.safe-change.json` for that check.

### Exit code 0 but checks are failing

Plain `check` exit code 0 means no NEW regressions; `check --strict` instead rejects any non-verified status. If checks were already failing at baseline time, they show as `fail-fail` (still failing). This is intentional: safe-change reports what got worse, not what was already broken.

## Update

Pull the latest source and rebuild:

```bash
cd safe-change
git pull
npm install
npm run build
```

## Uninstall

If you used `npm link`, unlink first:

```bash
npm unlink -g safe-change
```

Delete the cloned directory. In your projects, you can also remove the `.safe-change/` directory and `.safe-change.json` configuration file.
