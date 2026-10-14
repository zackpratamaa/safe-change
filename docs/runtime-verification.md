# Runtime Agent Verification Guide

This document defines the runtime verification methodology and evidence requirements for AI coding agents integrating with safe-change via canonical skills and the Model Context Protocol (MCP). Adapter support, MCP server tests, and live per-agent verification are separate claims.

## Overview

safe-change ships adapters for 10 AI coding agents across two integration tiers. Adapter availability does not by itself establish successful runtime invocation:
1. **MCP Native Tool Invocation (Tier 1 - Standard)**: Direct, programmatic execution via the Model Context Protocol. The agent discovers safe-change tools (`safe_change_save`, `safe_change_check`, `safe_change_diff`, `safe_change_status`, `safe_change_log`) and executes them natively through JSON-RPC.
2. **Skill Prompt Instruction (Tier 2 - Contract)**: Contextual loading via agent-specific skill directories (`.claude/skills/`, `.cursor/skills/`, `.agents/skills/`, etc.) following the instruction contract in `skills/safe-change/SKILL.md`.

## Verification Matrix

| Agent | Scope | Filesystem Validated | MCP Runtime Tested | Skill Auto-Invocation | Recommended Setup |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Google Antigravity** | Project / Global | Verified | Pending evidence | Pending evidence | Project `.agents/skills/` |
| **Claude Code (Anthropic)** | Project / Global | Verified | Pending evidence | Pending evidence | `mcpServers` config in `settings.json` |
| **Cursor (Anysphere)** | Project / Global | Verified | Pending evidence | Pending evidence | `mcpServers` in Cursor Settings |
| **OpenAI Codex** | Project / Global | Verified | Pending evidence | Pending evidence | CLI stdio wrapper / `AGENTS.md` |
| **Cline** | Project / Global | Verified | Pending evidence | Pending evidence | MCP server panel in VSCode |
| **Kimi Code** | Project / Global | Verified | Pending evidence | Pending evidence | `.kimi-code/skills/` |
| **Amp (Sourcegraph)** | Project / Global | Verified | Pending evidence | Pending evidence | Project `.agents/skills/` |
| **OpenCode** | Project / Global | Verified | Pending evidence | Pending evidence | `~/.config/opencode/skills/` |
| **Gemini CLI** | Project / Global | Verified | Pending evidence | Pending evidence | `.gemini/skills/` |
| **GitHub Copilot** | Project / Global | Verified | Pending evidence | Pending evidence | `.github/skills/` & `.agents/skills/` |

### What the statuses mean

- **Filesystem validated:** adapter installation, ownership tracking, file reading, and removal are covered by the repository's [installer tests](../tests/installer). This does not prove that an agent loads or invokes a skill during a live session.
- **MCP server tests:** [server.test.ts](../tests/mcp/server.test.ts) covers tool discovery, schemas, command mapping, error responses, and bounded execution using an SDK test client. [large-output.test.ts](../tests/mcp/large-output.test.ts) covers output handling. These tests are not live sessions with the ten named agents.
- **Pending evidence:** this document does not link a reproducible live-session record for that agent and invocation route. It does not mean the integration has been proven broken or that no private testing has occurred.

Do not mark a per-agent runtime cell as verified solely because an adapter exists or the generic MCP server test suite passes. Before changing a cell, link evidence recording:

1. Agent name/version, operating system, safe-change version or commit, and invocation route (MCP or skill).
2. Redacted configuration and a disposable test repository with a passing baseline.
3. A successful `safe_change_save` call, a controlled regression, and a `safe_change_check` result that reports the regression.
4. For skill auto-invocation, an unprompted invocation trace; explicitly asking the agent to call a tool is not proof of automatic invocation.
5. The execution transcript/artifact location and any limitations. Exclude secrets and private source code.

### Meta / Muse Code

Muse Code is not included in the shipped adapter list above, and no live Muse Code verification evidence is linked here. Treat it as a candidate integration, not confirmed support. Generic MCP compatibility alone does not establish that Muse Code discovers and uses safe-change successfully.

## Tier 1: MCP Runtime Verification (Recommended)

The Model Context Protocol represents the most robust runtime integration because it bypasses shell quoting and natural language misunderstanding.

### Verification Steps

1. Configure safe-change in your agent's MCP configuration:
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

2. Confirm available tools:
   - `safe_change_save`
   - `safe_change_check`
   - `safe_change_diff`
   - `safe_change_status`
   - `safe_change_log`

3. Verification Prompt:
```text
I am about to refactor the authentication middleware.
Use safe_change_save to record a baseline with description "pre-auth-refactor".
```

4. Expected Agent Tool Call:
```json
{
  "tool": "safe_change_save",
  "arguments": {
    "description": "pre-auth-refactor"
  }
}
```

5. Verification Outcome:
The expected successful tool call records the baseline and returns the execution report. After a controlled edit, request `safe_change_check` and retain its result. Automatic invocation after editing must be verified separately; it is not guaranteed by configuring the MCP server.

## Tier 2: Agent Skill Instructions (`SKILL.md`)

For agents using file-based skills, the following are manual test examples, not certified vendor configuration paths. Confirm current client support before using them:

### Claude Code Verification
- Skill location: `.claude/skills/safe-change/SKILL.md`
- For global projects, add to `CLAUDE.md`:
```markdown
## Safety Workflow
Before editing critical files, run `safe-change save "<description>"`.
After editing, run `safe-change check --strict` to verify no regressions occurred.
```
- Reload/restart using the installed client's supported mechanism; do not assume a particular slash command exists.

### Cursor Verification
- Skill location: `.cursor/skills/safe-change/SKILL.md`
- Add to `.cursorrules`:
```markdown
Always invoke `safe-change save` before executing multi-file refactors and `safe-change check --strict` afterwards.
```

## Summary

All 10 listed adapters have filesystem-validation coverage. Generic MCP server tests and per-agent live sessions are different evidence levels. MCP is the recommended integration route when the client supports it; verify tool discovery and execution in that client's actual version before claiming runtime support. The README and this matrix intentionally keep live runtime and auto-invocation at pending evidence until reproducible records are linked.
