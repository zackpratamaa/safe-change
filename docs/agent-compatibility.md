# Agent Compatibility Research (Milestone v0.1.1)

> Historical research/design snapshot, not current operational instructions or live-runtime certification. For current behavior use [Verification integrity](verification-integrity.md), [MCP setup](mcp-setup.md), and the [runtime evidence matrix](runtime-verification.md). Earlier phase/test-count statements below describe that snapshot.

This document records factual, evidence-evaluated research into the skill and configuration mechanisms for 10 supported AI coding agents:
1. Antigravity (Google DeepMind)
2. Claude Code (Anthropic)
3. Cursor (Anysphere)
4. OpenAI Codex
5. Cline
6. Kimi Code (Moonshot AI)
7. Amp (Sourcegraph)
8. OpenCode
9. Google Gemini CLI
10. GitHub Copilot

All 10 agents have filesystem-validated status in v0.1.1. Runtime verification will be performed in subsequent versions.

---

## Evaluation Standards and Verification Rules

To maintain strict evidence quality, all claims in this document are classified using the following rules:

- **Verified**: The exact behavior is explicitly documented by an authoritative official source or reproduced in an official runtime.
- **Partially verified**: Only part of the behavior is officially documented, precedence/reload mechanics are inferred, or documented behavior contains known ambiguities.
- **Not documented**: No authoritative official source confirms the behavior.
- **Runtime verified**: An actual supported agent runtime was executed to test and confirm the behavior.
- **Community observation**: Behavior reported by third-party users or community repositories; not accepted as official behavior.
- **Inferred**: Logical deduction based on standard operating system file semantics or general agent patterns; requires runtime validation.

---

## 1. Antigravity (Google DeepMind)

- **Overall Verification Status**: Partially verified
  *(Downgraded from Verified: specification source is private to the local runtime environment without a public canonical URL; no automated installation fixture or runtime test has been executed in safe-change.)*
- **Source Environment**: Local runtime environment documentation (Private).
- **Exact Path**:
  - `<appDataDir>\builtin\skills\agy-customizations\SKILL.md`
  - `<appDataDir>\builtin\skills\agy-customizations\docs\skills.md`
  - `<appDataDir>\builtin\skills\agy-customizations\docs\plugins.md`
- **Runtime Version**: Antigravity IDE (Gemini agent environment, built-in skill version 2.0).
- **Reproduction Method**: Open Antigravity IDE and inspect `<appDataDir>\builtin\skills\agy-customizations\SKILL.md` or invoke the built-in skill `agy-customizations`.
- **Source Visibility**: Private local runtime specification (not accessible via public web URL).
- **Access Date**: 2026-09-25.

### Specifications and Evidence

- **Skill File Format**:
  - *Evidence Type*: Documentation-verified (local runtime).
  - *Exact Source*: `agy-customizations/docs/skills.md`, heading "Main Instruction File (`SKILL.md`)".
  - *Quoted Excerpt*: "The `SKILL.md` file must start with a YAML frontmatter block containing the `name` and `description` fields."
  - *Verified Behavior*: Directory containing `SKILL.md` with YAML frontmatter (`name: <string>`, `description: <string>`). Optional subdirectories: `scripts/`, `examples/`, `resources/`, `references/`.
  - *Unknown Behavior*: Whether custom frontmatter keys cause silent rejection or warnings.
- **Project-Level Installation Path**:
  - *Evidence Type*: Documentation-verified (local runtime).
  - *Exact Source*: `agy-customizations/SKILL.md`, heading "Customization Discovery and Locations" -> "1. Workspace Customizations (Project-Specific)".
  - *Quoted Excerpt*: "Path: `.agents/` (or `.agent/`, `_agents/`, `_agent/`) at the root of your project."
  - *Verified Behavior*: `.agents/skills/<skill_name>/SKILL.md`.
  - *Unknown Behavior*: Handling of nested Git worktrees or non-standard workspace roots.
- **User/Global Installation Path**:
  - *Evidence Type*: Documentation-verified (local runtime).
  - *Exact Source*: `agy-customizations/SKILL.md`, heading "Customization Discovery and Locations" -> "3. Global Configuration (Machine-Local)".
  - *Quoted Excerpt*: "Path: `~/.gemini/config/` ... Applies to all projects and workspaces run on your machine."
  - *Verified Behavior*: `~/.gemini/config/skills/<skill_name>/SKILL.md` (Windows: `%USERPROFILE%\.gemini\config\skills\<skill_name>\SKILL.md`).
  - *Unknown Behavior*: Path handling on non-standard home directories or customized environment variables.
- **Precedence When Project and Global Both Exist**:
  - *Evidence Type*: Documentation-verified (local runtime).
  - *Exact Source*: `agy-customizations/SKILL.md`, heading "Loading Priority and Precedence".
  - *Quoted Excerpt*: "The priority order (from highest to lowest) is: 1. Workspace Project: Hierarchical discovery walking up from the CWD to the repository root. ... 3. Global Discovery: `~/.gemini/config/` ... If there are naming conflicts ... the higher-priority customization overrides the lower-priority one."
  - *Verified Behavior*: Workspace copies (`.agents/skills/`) strictly take precedence over global copies (`~/.gemini/config/skills/`).
  - *Unknown Behavior*: Behavior when identical names exist across legacy aliases (`.agents/` vs `.agent/`).
- **Automatic Loading**:
  - *Evidence Type*: Documentation-verified (local runtime).
  - *Exact Source*: `agy-customizations/SKILL.md`, heading "Progressive Disclosure (Skills and Rules)".
  - *Quoted Excerpt*: "Skills are not loaded into the context window by default. Only their names and descriptions are injected. The full content of a skill is only loaded if the model (or the user) explicitly decides to activate it."
  - *Verified Behavior*: Names and descriptions are indexed into the system prompt; full Markdown body is loaded on-demand.
  - *Unknown Behavior*: Context budget limits when hundreds of skills are installed simultaneously.
- **Reload Behavior**:
  - *Evidence Type*: Inferred / Partially verified.
  - *Exact Source*: `agy-customizations/SKILL.md`.
  - *Verified Behavior*: Workspace directory scanning occurs across turn boundaries.
  - *Unknown Behavior*: Whether in-memory index caches require an explicit window reload or IDE restart for immediate pickup of new directories.
- **Install Method**:
  - *Evidence Type*: Inferred (file system operation).
  - *Exact Source*: Not explicitly documented as a dedicated CLI package command in the local runtime doc.
  - *Verified Behavior*: Copying or symlinking the skill directory into `.agents/skills/<skill_name>/`.
  - *Unknown Behavior*: Programmatic installer behavior, symlink support across Windows NTFS vs POSIX, and file permission preservation.
- **Update Method**:
  - *Evidence Type*: Inferred (file system operation).
  - *Exact Source*: Not explicitly documented as a dedicated CLI update command.
  - *Verified Behavior*: Overwriting files in `.agents/skills/<skill_name>/`.
  - *Unknown Behavior*: Atomic update mechanics and runtime reload synchronization during active turns.
- **Uninstall Method**:
  - *Evidence Type*: Inferred (file system operation).
  - *Exact Source*: Not explicitly documented as a dedicated CLI uninstall command.
  - *Verified Behavior*: Recursive deletion of `.agents/skills/<skill_name>/`.
  - *Unknown Behavior*: Whether agent sessions keep stale in-memory indices after folder deletion until restart.
- **Separate CLI Executable Requirement**:
  - *Evidence Type*: Documentation-verified (skill contract design).
  - *Exact Source*: `skills/safe-change/SKILL.md`, section "Command Reference".
  - *Verified Behavior*: The skill markdown instructs the agent to run `safe-change` in terminal tools; the CLI binary must be installed on PATH.
  - *Unknown Behavior*: PATH detection on non-standard shells or virtual environments.

### Missing Evidence and Remaining Unknowns
1. No public, authoritative web documentation URL is available for external auditor validation.
2. No end-to-end install fixture has been run to verify safe-change installation, execution, and cleanup.
3. Windows junction vs symlink compatibility for global skill directories requires runtime testing.

---

## 2. Claude Code (Anthropic)

- **Overall Verification Status**: Partially verified
  *(Downgraded from Verified: precedence and shadowing between personal and project skills exhibit documented ambiguities and community-reported conflicts; no installer tested.)*
- **Source Environment**: Public official documentation.
- **Exact URLs**:
  - `https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview`
  - `https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/memory`
  - `https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/slash-commands`
- **Product / Documentation Version**: Claude Code CLI v2.1.152+.
- **Source Visibility**: Public official documentation.
- **Access Date**: 2026-09-25.

### Specifications and Evidence

- **Skill File Format**:
  - *Evidence Type*: Documentation-verified (official docs).
  - *Exact Source*: `https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/memory`, heading "Skills".
  - *Quoted Excerpt*: "A skill is essentially a 'process document' (often a directory containing a `SKILL.md` file) that defines a workflow for Claude... It specifies the steps to take, the context to load, and the expected output."
  - *Verified Behavior*: Directory containing `SKILL.md` with YAML frontmatter `description`.
  - *Unknown Behavior*: Whether Claude Code requires or rejects the `name` frontmatter field present in the canonical safe-change `SKILL.md`.
- **Project-Level Installation Path**:
  - *Evidence Type*: Documentation-verified (official docs).
  - *Exact Source*: `https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/memory`, heading "Where They Live" -> "Project Scope".
  - *Quoted Excerpt*: "Stored in `.claude/skills/` within a specific repository (for project-specific standards)."
  - *Verified Behavior*: `.claude/skills/<skill-name>/SKILL.md`.
  - *Unknown Behavior*: Maximum directory depth searched for nested submodules.
- **User/Global Installation Path**:
  - *Evidence Type*: Documentation-verified (official docs).
  - *Exact Source*: `https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/memory`, heading "Where They Live" -> "User Scope".
  - *Quoted Excerpt*: "Stored in `~/.claude/skills/` (for personal use across all projects)."
  - *Verified Behavior*: `~/.claude/skills/<skill-name>/SKILL.md`.
  - *Unknown Behavior*: Windows-specific `%USERPROFILE%` path normalization in hybrid WSL environments.
- **Precedence When Project and Global Both Exist**:
  - *Evidence Type*: Partially verified / Community observation.
  - *Exact Source*: Anthropic Claude Code documentation overview and community tracking.
  - *Quoted Excerpt*: Priority hierarchy is documented as Enterprise > Personal > Project > Plugins.
  - *Verified Behavior*: Personal skills can override or take precedence over project skills under certain configurations.
  - *Unknown Behavior*: Community reports indicate inconsistent shadowing and collision warnings when a personal skill and a project skill share an identical name without Enterprise policy enforcement. Downgraded to Partially verified pending official clarification.
- **Automatic Loading**:
  - *Evidence Type*: Documentation-verified (official docs).
  - *Exact Source*: `https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/memory`, heading "Skills" -> "Invocation".
  - *Quoted Excerpt*: "Claude automatically loads relevant skills based on the requirements... You can invoke a skill directly via the command line (e.g., `/skill-name`), or Claude can load and trigger them automatically when relevant."
  - *Verified Behavior*: Model-invoked based on semantic description or explicitly triggered as a slash command.
  - *Unknown Behavior*: Threshold sensitivity for semantic triggering of safe-change workflows vs general git instructions.
- **Reload Behavior**:
  - *Evidence Type*: Documentation-verified (official docs).
  - *Exact Source*: `https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/slash-commands`, heading "`/reload-skills`".
  - *Quoted Excerpt*: "`/reload-skills`: Re-scan all skill directories mid-session without needing to restart Claude Code."
  - *Verified Behavior*: In-session reload command exists; live change detection active for existing watched folders.
  - *Unknown Behavior*: Whether newly created directories added outside `--add-dir` require a session restart.
- **Install Method**:
  - *Evidence Type*: Inferred for standalone skills; Documentation-verified for plugins.
  - *Exact Source*: `https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview`.
  - *Verified Behavior*: File copy into `.claude/skills/<name>/` for standalone skills; `/plugin install` for marketplace plugins.
  - *Unknown Behavior*: Automated skill validation prior to placement in `.claude/skills/`.
- **Update Method**:
  - *Evidence Type*: Inferred (file overwrite).
  - *Exact Source*: Not explicitly documented as a dedicated CLI skill update command.
  - *Verified Behavior*: Overwriting `SKILL.md`.
  - *Unknown Behavior*: Hot reload timing after external file rewrite.
- **Uninstall Method**:
  - *Evidence Type*: Inferred (file deletion).
  - *Exact Source*: Not explicitly documented as a dedicated CLI skill uninstall command.
  - *Verified Behavior*: Deletion of `.claude/skills/<name>/`.
  - *Unknown Behavior*: Slash command unregistration in active terminal sessions.
- **Separate CLI Executable Requirement**:
  - *Evidence Type*: Documentation-verified (skill contract design).
  - *Exact Source*: `skills/safe-change/SKILL.md`, section "Command Reference".
  - *Verified Behavior*: Skill instructions invoke terminal shell commands; `safe-change` executable must be present on PATH.
  - *Unknown Behavior*: Non-standard shell environments (e.g., restricted subshells).

### Missing Evidence and Remaining Unknowns
1. Deterministic collision and shadowing behavior between `~/.claude/skills/safe-change/` and `.claude/skills/safe-change/`.
2. Exact compatibility of YAML frontmatter `name` tag alongside `description` in Claude Code parsing.
3. No automated test fixture has validated Claude Code invocation of safe-change in this repository.

---

## 3. Cursor (Anysphere)

- **Overall Verification Status**: Partially verified
  *(Strictly separating officially documented `.cursor/rules/*.mdc` from undocumented `.cursor/skills/` community conventions.)*
- **Source Environment**: Public official documentation (for rules); Community observations (for skills).
- **Exact URLs**:
  - `https://docs.cursor.com/context/rules-for-ai`
- **Product / Documentation Version**: Cursor v0.42+.
- **Source Visibility**: Public official documentation.
- **Access Date**: 2026-09-25.

### Specifications and Evidence

- **Skill File Format**:
  - *Evidence Type*: Documentation-verified for rules; Not documented for skills.
  - *Exact Source*: `https://docs.cursor.com/context/rules-for-ai`, heading "Key Characteristics of `.mdc` Rules".
  - *Quoted Excerpt*: "Each rule is a Markdown file with YAML frontmatter at the top... Ensure all rule files use the `.mdc` extension; plain `.md` files in the `.cursor/rules/` directory are ignored by the rules system."
  - *Verified Behavior*: `.cursor/rules/<name>.mdc` with frontmatter (`description`, `globs`, `alwaysApply: boolean`).
  - *Unknown Behavior*: A directory-based `.cursor/skills/` convention is not documented anywhere on `docs.cursor.com`. Using canonical `SKILL.md` directly is unverified and unsupported without format conversion.
- **Project-Level Installation Path**:
  - *Evidence Type*: Documentation-verified for rules; Not documented for skills.
  - *Exact Source*: `https://docs.cursor.com/context/rules-for-ai`, heading "Location".
  - *Quoted Excerpt*: "Rules must be stored in the `.cursor/rules/` directory of your project."
  - *Verified Behavior*: `.cursor/rules/safe-change.mdc`.
  - *Unknown Behavior*: `.cursor/skills/safe-change/SKILL.md` is an unverified community convention.
- **User/Global Installation Path**:
  - *Evidence Type*: Documentation-verified for rules UI; Not documented for file system paths.
  - *Exact Source*: `https://docs.cursor.com/context/rules-for-ai`, heading "Rule Anatomy & Configuration".
  - *Verified Behavior*: Cursor UI (*Settings > General > Rules for AI*).
  - *Unknown Behavior*: No officially documented global file system path (such as `~/.cursor/rules/` or `~/.cursor/skills/`) exists in Cursor official documentation.
- **Precedence When Project and Global Both Exist**:
  - *Evidence Type*: Partially verified.
  - *Exact Source*: `https://docs.cursor.com/context/rules-for-ai`.
  - *Verified Behavior*: Project-level `.cursor/rules/*.mdc` overrides or supplements global UI settings.
  - *Unknown Behavior*: No global skill directory precedence exists because global skill directories are not officially documented.
- **Automatic Loading**:
  - *Evidence Type*: Documentation-verified for rules.
  - *Exact Source*: `https://docs.cursor.com/context/rules-for-ai`, heading "Rule Anatomy & Configuration".
  - *Quoted Excerpt*: "Always Apply: The rule is included in every chat session... Apply Intelligently: The AI determines if the rule is relevant based on the description provided."
  - *Verified Behavior*: Rules with `alwaysApply: true` are injected into context; rules with matching `globs` attach on relevant file access.
  - *Unknown Behavior*: Token overhead when large runbooks are set to `alwaysApply: true`.
- **Reload Behavior**:
  - *Evidence Type*: Inferred / Community observation.
  - *Exact Source*: Not explicitly documented as a hot reload command.
  - *Verified Behavior*: Starting a new chat session or running `Developer: Reload Window` in Cursor.
  - *Unknown Behavior*: Whether file-system changes to `.cursor/rules/` are hot-reloaded mid-session without window reload.
- **Install Method**:
  - *Evidence Type*: Inferred (file system write).
  - *Exact Source*: No CLI installer documented.
  - *Verified Behavior*: Writing `.cursor/rules/safe-change.mdc`.
  - *Unknown Behavior*: Conversion pipeline from canonical `SKILL.md` to `.mdc` frontmatter.
- **Update Method**:
  - *Evidence Type*: Inferred (file overwrite).
  - *Exact Source*: No CLI update command.
  - *Verified Behavior*: Overwriting `.cursor/rules/safe-change.mdc`.
  - *Unknown Behavior*: None.
- **Uninstall Method**:
  - *Evidence Type*: Inferred (file deletion).
  - *Exact Source*: No CLI uninstall command.
  - *Verified Behavior*: Deleting `.cursor/rules/safe-change.mdc`.
  - *Unknown Behavior*: None.
- **Separate CLI Executable Requirement**:
  - *Evidence Type*: Documentation-verified (skill contract design).
  - *Exact Source*: `skills/safe-change/SKILL.md`.
  - *Verified Behavior*: Cursor terminal agent executes shell commands; `safe-change` executable must be installed on PATH.
  - *Unknown Behavior*: None.

### Missing Evidence and Remaining Unknowns
1. Cursor has zero official documentation for standalone `skills/` directories or `SKILL.md`.
2. Content transformation is strictly required to adapt safe-change instructions into a Cursor `.mdc` rule.
3. Global file-based installation is unverified; only project-level `.cursor/rules/` has official documentation.

---

## 4. Codex (OpenAI / Codex CLI)

- **Overall Verification Status**: Partially verified
  *(Strictly separating officially documented `AGENTS.md` from undocumented `.codex/skills/` and `~/.codex/skills/` conventions.)*
- **Source Environment*: Public official documentation (for `AGENTS.md`); Community observations (for skills directories).
- **Exact URLs**:
  - `https://openai.com/index/agents-md/`
  - `https://chatgpt.com/codex`
- **Product / Documentation Version**: OpenAI Codex CLI / `AGENTS.md` specification.
- **Source Visibility**: Public official documentation.
- **Access Date**: 2026-09-25.

### Specifications and Evidence

- **Skill File Format**:
  - *Evidence Type*: Documentation-verified for `AGENTS.md`; Not documented for `.codex/skills/`.
  - *Exact Source*: `https://openai.com/index/agents-md/`, heading "AGENTS.md".
  - *Quoted Excerpt*: "`AGENTS.md` is a configuration file format used to provide instructions and context to coding agents like Codex... Ensure the filename is exactly `AGENTS.md` (uppercase and plural) to ensure proper discovery by the agent."
  - *Verified Behavior*: Single Markdown file named `AGENTS.md` at project root or home directory.
  - *Unknown Behavior*: A directory-based `.codex/skills/<name>/SKILL.md` convention is not documented in official OpenAI Codex documentation; it is an unverified ecosystem convention.
- **Project-Level Installation Path**:
  - *Evidence Type*: Documentation-verified for `AGENTS.md`; Not documented for `.codex/skills/`.
  - *Exact Source*: `https://openai.com/index/agents-md/`, heading "Hierarchical Discovery".
  - *Quoted Excerpt*: "Agents typically discover these files by walking up the directory tree... Project scope overrides global settings with project-specific instructions."
  - *Verified Behavior*: `AGENTS.md` in repository root.
  - *Unknown Behavior*: Programmatic merging into existing `AGENTS.md` without clobbering user instructions.
- **User/Global Installation Path**:
  - *Evidence Type*: Documentation-verified for `AGENTS.md`; Not documented for skills directories.
  - *Exact Source*: `https://openai.com/index/agents-md/`, heading "Key Features of `AGENTS.md`".
  - *Quoted Excerpt*: "By placing an `AGENTS.md` file in your home directory or project root, you can ensure that agents consistently follow your preferences... Global scope sets defaults for all repositories."
  - *Verified Behavior*: `~/AGENTS.md` (or `%USERPROFILE%\AGENTS.md`).
  - *Unknown Behavior*: Dedicated global skills folder `~/.codex/skills/` is not officially documented.
- **Precedence When Project and Global Both Exist**:
  - *Evidence Type*: Documentation-verified for `AGENTS.md`.
  - *Exact Source*: `https://openai.com/index/agents-md/`, heading "Hierarchical Discovery".
  - *Verified Behavior*: Project-level `AGENTS.md` discovered during directory walk takes precedence over home directory defaults.
  - *Unknown Behavior*: Precedence resolution if both `AGENTS.md` and community `.codex/skills/` exist simultaneously.
- **Automatic Loading**:
  - *Evidence Type*: Documentation-verified for `AGENTS.md`.
  - *Exact Source*: `https://openai.com/index/agents-md/`, heading "Persistent Guidance".
  - *Verified Behavior*: Loaded into context at session startup.
  - *Unknown Behavior*: No selective progressive disclosure; entire file is injected on session start, impacting token context.
- **Reload Behavior**:
  - *Evidence Type*: Inferred / Partially verified.
  - *Exact Source*: OpenAI Codex CLI reference (`chatgpt.com/codex`).
  - *Verified Behavior*: Starting a new session (`codex .`) reloads configuration.
  - *Unknown Behavior*: In-session hot reload command is not documented.
- **Install Method**:
  - *Evidence Type*: Inferred (file edit / write).
  - *Exact Source*: No CLI installer command documented.
  - *Verified Behavior*: Writing or appending safe-change instructions to `AGENTS.md`.
  - *Unknown Behavior*: Safe collision-free merging and uninstall mechanisms for multi-agent repositories.
- **Update Method**:
  - *Evidence Type*: Inferred (file edit).
  - *Exact Source*: No CLI update command documented.
  - *Verified Behavior*: Updating safe-change section in `AGENTS.md`.
  - *Unknown Behavior*: Version tracking inside a monolithic Markdown file.
- **Uninstall Method**:
  - *Evidence Type*: Inferred (file edit).
  - *Exact Source*: No CLI uninstall command documented.
  - *Verified Behavior*: Removing safe-change section from `AGENTS.md`.
  - *Unknown Behavior*: Clean automated removal without corrupting user-defined rules.
- **Separate CLI Executable Requirement**:
  - *Evidence Type*: Documentation-verified (skill contract design).
  - *Exact Source*: `skills/safe-change/SKILL.md`.
  - *Verified Behavior*: Codex executes terminal commands; `safe-change` executable must be installed on PATH.
  - *Unknown Behavior*: None.

### Missing Evidence and Remaining Unknowns
1. Dedicated standalone skill directory format (`.codex/skills/`) is not officially documented.
2. Direct integration requires transforming the canonical `SKILL.md` into an embedded section of `AGENTS.md`.
3. Merging into existing `AGENTS.md` files poses collision and formatting risks without an AST-aware Markdown parser.

---

## 5. Verification Matrix

The following matrix records the evaluated capabilities across all four targets. Unknown cells are left as "Unknown" or "Not documented" without guesswork.

| Agent | Capability | Evidence type | Exact source | Verified behavior | Unknown behavior | Confidence | Installer readiness |
|---|---|---|---|---|---|---|---|
| **Antigravity** | Skill file format | Documentation-verified | `agy-customizations/docs/skills.md` | `SKILL.md` with YAML frontmatter `name` and `description` | Custom frontmatter keys parsing behavior | High | Candidate (pending runtime validation) |
| **Antigravity** | Project path | Documentation-verified | `agy-customizations/SKILL.md` | `.agents/skills/<skill_name>/SKILL.md` | Handling of nested Git worktrees | High | Candidate (pending runtime validation) |
| **Antigravity** | Global path | Documentation-verified | `agy-customizations/SKILL.md` | `~/.gemini/config/skills/<skill_name>/SKILL.md` | Non-standard home directory paths | High | Candidate (pending runtime validation) |
| **Antigravity** | Precedence | Documentation-verified | `agy-customizations/SKILL.md` | Workspace project (priority 1) strictly overrides global (priority 3) | Collisions across legacy directory aliases | High | Candidate (pending runtime validation) |
| **Antigravity** | Automatic loading | Documentation-verified | `agy-customizations/SKILL.md` | Progressive disclosure (index injected; body loaded on demand) | Context budget limits with large skill libraries | High | Candidate (pending runtime validation) |
| **Antigravity** | Reload behavior | Inferred | `agy-customizations/SKILL.md` | Turn-boundary directory scanning | Explicit in-session reload command | Medium | Research needed |
| **Antigravity** | Install method | Inferred | File system semantics | Copying or linking folder into `.agents/skills/` | Cross-platform symlink vs junction semantics | Medium | Candidate (pending runtime validation) |
| **Antigravity** | Update method | Inferred | File system semantics | Overwriting files in target folder | Atomic replacement during active turns | Medium | Candidate (pending runtime validation) |
| **Antigravity** | Uninstall method | Inferred | File system semantics | Recursive deletion of target folder | In-memory cache invalidation timing | Medium | Candidate (pending runtime validation) |
| **Antigravity** | Separate CLI requirement | Documentation-verified | `skills/safe-change/SKILL.md` | CLI executable must be available on PATH | Execution in restricted subshells | High | Ready (documented requirement) |
| **Claude Code** | Skill file format | Documentation-verified | `docs.anthropic.com/en/docs/agents-and-tools/claude-code/memory` | `SKILL.md` with YAML frontmatter `description` | Compatibility with `name` frontmatter key | High | Research needed |
| **Claude Code** | Project path | Documentation-verified | `docs.anthropic.com/en/docs/agents-and-tools/claude-code/memory` | `.claude/skills/<skill-name>/SKILL.md` | Maximum directory search depth | High | Research needed |
| **Claude Code** | Global path | Documentation-verified | `docs.anthropic.com/en/docs/agents-and-tools/claude-code/memory` | `~/.claude/skills/<skill-name>/SKILL.md` | Windows `%USERPROFILE%` handling in WSL | High | Research needed |
| **Claude Code** | Precedence | Partially verified | Official docs and community issue tracking | Priority hierarchy Enterprise > Personal > Project > Plugins | Shadowing bugs and identical-name collision resolution | Medium | Blocked (missing evidence) |
| **Claude Code** | Automatic loading | Documentation-verified | `docs.anthropic.com/en/docs/agents-and-tools/claude-code/memory` | Semantic activation based on description; slash command support | Trigger sensitivity tuning | High | Research needed |
| **Claude Code** | Reload behavior | Documentation-verified | `docs.anthropic.com/en/docs/agents-and-tools/claude-code/slash-commands` | `/reload-skills` command re-scans directories mid-session | Discovery of new parent directories outside `--add-dir` | High | Research needed |
| **Claude Code** | Install method | Inferred | File system semantics | Copying folder into `.claude/skills/<name>/` | Automated validation before directory placement | Medium | Research needed |
| **Claude Code** | Update method | Inferred | File system semantics | Overwriting `SKILL.md` | Live reload timing during execution | Medium | Research needed |
| **Claude Code** | Uninstall method | Inferred | File system semantics | Deleting `.claude/skills/<name>/` folder | Slash command unregistration latency | Medium | Research needed |
| **Claude Code** | Separate CLI requirement | Documentation-verified | `skills/safe-change/SKILL.md` | CLI executable must be available on PATH | Execution in restricted subshells | High | Ready (documented requirement) |
| **Cursor** | Skill file format | Not documented | `docs.cursor.com/context/rules-for-ai` | Not documented for skills; Rules require `.mdc` format | No official directory-based skill format exists | Low | Not ready (format transformation required) |
| **Cursor** | Project path | Documentation-verified (rules) | `docs.cursor.com/context/rules-for-ai` | `.cursor/rules/<name>.mdc` (official for rules) | `.cursor/skills/` is unverified community convention | Low | Not ready (requires `.mdc` rule) |
| **Cursor** | Global path | Documentation-verified (UI) | `docs.cursor.com/context/rules-for-ai` | Cursor UI Settings (Rules for AI) | No official file-system global directory exists | Low | Blocked (missing evidence) |
| **Cursor** | Precedence | Partially verified | `docs.cursor.com/context/rules-for-ai` | Project `.cursor/rules/` overrides global UI settings | Skill directory precedence is unverified | Low | Blocked (missing evidence) |
| **Cursor** | Automatic loading | Documentation-verified (rules) | `docs.cursor.com/context/rules-for-ai` | `alwaysApply: true` or matching `globs` | Skill folder auto-load is not documented | Medium | Not ready |
| **Cursor** | Reload behavior | Inferred | Cursor developer commands | `Developer: Reload Window` or new chat session | Hot reload of modified `.mdc` files without reload | Medium | Research needed |
| **Cursor** | Install method | Inferred | File system semantics | Writing `.cursor/rules/<name>.mdc` | CLI installer does not exist | Medium | Not ready (format transformation required) |
| **Cursor** | Update method | Inferred | File system semantics | Overwriting `.cursor/rules/<name>.mdc` | None | Medium | Not ready |
| **Cursor** | Uninstall method | Inferred | File system semantics | Deleting `.cursor/rules/<name>.mdc` | None | Medium | Not ready |
| **Cursor** | Separate CLI requirement | Documentation-verified | `skills/safe-change/SKILL.md` | CLI executable must be available on PATH | None | High | Ready (documented requirement) |
| **Codex** | Skill file format | Not documented | `openai.com/index/agents-md/` | Not documented for skills; Instructions require `AGENTS.md` | Standalone skill directory format is unverified | Low | Not ready (format transformation required) |
| **Codex** | Project path | Documentation-verified (file) | `openai.com/index/agents-md/` | `AGENTS.md` at repository root | `.codex/skills/` is unverified community convention | Low | Not ready (requires `AGENTS.md` integration) |
| **Codex** | Global path | Documentation-verified (file) | `openai.com/index/agents-md/` | `~/AGENTS.md` (home directory) | `~/.codex/skills/` is unverified community convention | Low | Blocked (missing evidence) |
| **Codex** | Precedence | Documentation-verified (file) | `openai.com/index/agents-md/` | Project `AGENTS.md` overrides global `~/AGENTS.md` | Skill folder precedence is unverified | Medium | Blocked (missing evidence) |
| **Codex** | Automatic loading | Documentation-verified (file) | `openai.com/index/agents-md/` | Entire `AGENTS.md` read at session start | No progressive disclosure for standalone skills | Medium | Not ready |
| **Codex** | Reload behavior | Inferred | `chatgpt.com/codex` | Session restart (`codex .`) reloads configuration | Mid-session hot reload command | Low | Research needed |
| **Codex** | Install method | Inferred | File edit semantics | Appending instructions to `AGENTS.md` | Safe collision-free merging mechanism | Low | Not ready (requires parser/merger) |
| **Codex** | Update method | Inferred | File edit semantics | Editing safe-change section in `AGENTS.md` | Section versioning inside monolithic file | Low | Not ready |
| **Codex** | Uninstall method | Inferred | File edit semantics | Deleting safe-change section in `AGENTS.md` | Clean section removal without corrupting user rules | Low | Not ready |
| **Codex** | Separate CLI requirement | Documentation-verified | `skills/safe-change/SKILL.md` | CLI executable must be available on PATH | None | High | Ready (documented requirement) |

---

## 6. Recommendation

### Candidate for first integration: Antigravity

Antigravity is designated as the candidate for the first runtime integration. It is not described as a verified installer target because an actual install fixture and automated runtime execution have not yet been tested in this repository.

#### Why it is a candidate
1. **Canonical `SKILL.md` appears structurally compatible**: The canonical safe-change skill at `skills/safe-change/SKILL.md` contains the exact frontmatter fields (`name`, `description`) and markdown structure specified in Antigravity's customization system.
2. **Project path is known from the available source**: The local runtime specification explicitly defines `.agents/skills/<skill_name>/SKILL.md` as the authoritative project-level discovery path.
3. **Implementation is likely to require no content transformation**: Unlike Cursor (which requires converting to `.cursor/rules/*.mdc`) or Codex (which requires appending to `AGENTS.md`), Antigravity can consume the canonical skill directory directly without template transformation or syntax conversion.

#### Evidence still required before implementation
1. **Runtime verification**: Execution of an automated install test fixture copying `skills/safe-change/` into a temporary `.agents/skills/` directory and confirming agent pickup.
2. **Public documentation corroboration**: Corroborating local specification rules against public documentation or official release notes as they become accessible.
3. **Platform verification**: Testing directory creation and symlink/junction behavior on both Windows and POSIX operating systems.

#### Unknowns
1. **Frontmatter extension tolerance**: Whether Antigravity permits or ignores additional metadata fields in `SKILL.md` beyond `name` and `description`.
2. **Context indexing overhead**: How many total skills can be present in `.agents/skills/` before prompt indexing performance or token limits degrade.
3. **Cache invalidation timing**: Whether mid-session directory creation is immediately recognized on the subsequent turn or requires an IDE window reload.

#### Installation, update, collision, and uninstall behavior still requiring runtime validation
1. **Installation**: Validating directory permissions, directory creation idempotency, and handling when `.agents/` does not yet exist in the repository root.
2. **Update**: Verifying atomic file overwriting when an active agent session may have opened file handles to `SKILL.md`.
3. **Collision**: Validating behavior when `.agents/skills/safe-change/` collides with a pre-existing user-defined skill of the same name, or when global (`~/.gemini/config/skills/safe-change/`) and project skills conflict.
4. **Uninstall**: Validating clean directory removal without leaving orphan subdirectories or causing agent error states on subsequent prompt turns.
