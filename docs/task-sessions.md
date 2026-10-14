# Task sessions and continuous observation

Status: experimental source implementation, not a published npm release or live IDE certification.

## What is implemented

`session` adds a persistent change contract, verification-timing choice, foreground polling observer, and cooperative workflow gates. It does not replace `save`, `check --strict`, capabilities, signed approvals, or OS isolation. No additional framework dependencies are installed.

A contract contains intent, literal allowed paths, protected paths, uniquely identified requirements with declared check names, and non-goals. Directory scopes end in `/`; globs, traversal, absolute paths and internal Git/Safe-Change state are rejected. Check-name mappings are declarations, not proof of complete requirements coverage. Design/UX interpretation, license similarity analysis and learned quality scoring are not implemented by this command.

## Lifecycle

Prepare a contract from [the example](../examples/change-contract.json) and adapt it to the actual repository. Put the contract under a user-approved path before starting the session. Do not add generated state to version control.

```bash
safe-change session start feature-123 --file examples/change-contract.json --json
safe-change session status feature-123 --json
```

Starting records Git-visible source/index hashes and branch/revision identity. It executes no configured project checks and is **not** a behavioral baseline. Existing sessions cannot be overwritten. A session expires after 24 hours.

The agent asks in chat: "Safe-Change can keep observing. Verify now or before finishing?" A person records the choice in their own interactive terminal:

```bash
safe-change session decide feature-123
```

Choices: `now`, `before-finish`, or `declined`. Silence is not a choice. There is intentionally no non-interactive choice flag or MCP consent-setting tool. A native hook permission confirmation is distinct from this task timing choice. The agent must not open a pseudo-terminal or edit state to impersonate a person.

The timing choice grants neither test execution nor edits, network, spending, Git mutation, or baseline replacement. Follow the project's independent permissions and signed approval policy. User declines do not override mandatory project release gates.

Start observation separately, after the person authorizes it. This command stays in the foreground; use a separate terminal or a user-owned process supervisor:

```bash
safe-change session watch feature-123 --json
```

The observer hashes Git-visible files approximately every two seconds, after each scan finishes. It never runs configured checks, invokes models, sends telemetry, edits application code, or saves a test baseline. It writes only local session metadata. Interrupt normally to stop it. `status` reports `stopped`, `active`, `stale`, or `error`; an old heartbeat is not active monitoring. `observe` takes a single snapshot without starting a watcher.

```bash
safe-change session observe feature-123 --json
safe-change session gate feature-123 before-edit --json
```

When authorized, record the real baseline **before the first edit**, even if final verification is deferred:

```bash
safe-change save "feature-123 initial behavior" --json
```

If baseline checks are not yet authorized, explain the limitation. A later baseline is only accepted for this task if its source/index and Git identity match the original task observation. It cannot retrospectively prove the original runtime environment or execution history. Do not manufacture a baseline from modified source.

After implementation, when execution is authorized:

```bash
safe-change check --strict --json
safe-change session gate feature-123 before-finish --json
```

The finish gate requires fresh existing verifier evidence bound to the current source, baseline and fingerprint, generated during the session, plus passing declared check names. A green mapping does not establish complete behavioral coverage. Source changes invalidate evidence. Branch/revision changes, out-of-scope changes and protected verification-input changes block progression. Review legitimate contract/test changes explicitly and establish a separately reviewed task; do not silently reset the task or baseline to clear a finding.

`declined` permits a bounded unverified workflow handoff but never a claim of verified safety, and never overrides another required policy gate. Choosing `before-finish` allows implementation without pretending verification has already occurred.

## Agent integration and experimental Claude-compatible hook

Installing the canonical skill provides instructions, not automatic monitoring or guaranteed execution. The existing five-tool MCP interface is unchanged. Agents with shell access can call `session gate`; MCP-only clients cannot invoke the new session command through an invented MCP tool.

An experimental hook output adapter is available:

```bash
safe-change session hook feature-123 before-edit --json
safe-change session hook feature-123 before-finish --json
```

For a host supporting the corresponding Claude hook protocol, map the first command to a reviewed `PreToolUse` configuration for `Edit|Write|MultiEdit`; map the second to `Stop`. Use a trusted absolute binary path, the correct repository working directory and an explicit task id. Review and merge configuration manually; this release does not modify user hooks or install them automatically. Startup/compaction restoration is a `session status` read plus reloading the canonical instruction, not an unimplemented automatic hook.

The edit adapter emits `ask`/`deny` in `hookSpecificOutput` or an empty object for allow. The stop adapter emits a blocking decision when unresolved. Successful protocol responses use exit 0; missing/corrupt state and internal failures use blocking exit 2. The normal `session gate` command uses exit 0 for allow and 1 for ask/block. Usage/state errors use exit 3; outside Git uses exit 4. A persistent watcher owns its process lifetime; it is not an MCP daemon.

Only emitted protocol shapes and CLI integration have automated evidence. No live Claude session or other IDE runtime was tested. Hosts/versions differ. An Edit/Write matcher does not cover shell, alternate tools, remote APIs or other processes. Do not advertise comprehensive enforcement. A missing host hook cannot be repaired by prompt text alone.

## Trust and failure boundaries

- Local session state and TTY checks are cooperative workflow controls, **not authenticated human identity**. A same-user unrestricted agent can emulate a terminal, edit state, stop the watcher or bypass the CLI. Use existing signed approvals and an external enforcement boundary where required.
- The observer sees Git-visible file/index snapshots, not ignored/external artifacts or every transient mutation. Hashes do not retain file bodies or enable rollback.
- Heartbeats report recent progress, not process authenticity. Delays on large repositories may produce `stale`. Polling overhead grows with repository size; no performance budget is yet guaranteed.
- Atomic replacement and exclusive update/watcher locks prevent ordinary concurrent overwrites. Stale locks are not silently stolen. After a crash, a person must confirm no process owns the task before manually removing its lock. This version does not automatically resume watchers after a crash.
- Symlinked state ancestors/files are rejected before access. These checks do not eliminate hostile same-user filesystem races.
- No permission escalation, auto-repair, subagent spawning, background network requests, model training, or license change occurs.
