# MCP Server Setup Guide

Safe-Change exposes five core tools through stdio MCP. Filesystem adapter tests,
generic MCP protocol tests, and live per-agent sessions are separate evidence.
All ten listed agents' live routes remain [pending evidence](runtime-verification.md).

## Server launch

Install an approved release or build an approved source commit:

```bash
safe-change --version
safe-change mcp
```

For a source build, run Node with absolute `dist/cli.js` path and argument `mcp`.
GUI clients may not inherit terminal PATH. The stdio launch fields are:

```json
{"command":"safe-change","args":["mcp"]}
```

Some clients wrap these in mcpServers; others use UI, TOML, or another schema.
Use the installed client's current official configuration mechanism. One JSON
config path is not valid for every agent. Vendor configuration/discovery and
auto-invocation are not certified by generic server tests. New strict/binding
features on main are not automatically present in an older npm package.

## Verify a connection

Reload/restart as the client requires, list tools, and explicitly call
safe_change_status with the intended repository's absolute cwd. Success proves
that session's tool connectivity, not auto-invocation or project verification.

## Tool reference

| Tool | Contract |
|---|---|
| safe_change_save | Run checks and record baseline; reject observed input mutation |
| safe_change_check | Compare results; strict:true requires verified status |
| safe_change_diff | File-level summary; use Git separately for line diffs |
| safe_change_status | Baseline existence/time and check summary |
| safe_change_log | Local safety history; optional last limit |

For final verification:

```json
{"name":"safe_change_check","arguments":{"cwd":"/absolute/path/to/repository","strict":true}}
```

Read verification.state and exitCode in returned JSON. Plain exit zero is no new
regression, not necessarily verified. Strict non-verified exit one remains report
data; MCP isError is not deployment approval. Infrastructure/configuration errors
may be tool errors.

## Skill plus MCP

```bash
safe-change install <agent>
```

Skill instructions tell an agent when to use tools; MCP supplies a callable route.
Neither guarantees invocation or obedience. Review oracle changes before accepting
another baseline. Mandatory approval needs external CI/permission boundaries.
See [Verification integrity](verification-integrity.md).
