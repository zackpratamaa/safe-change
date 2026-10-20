# Persistent Safety Log

The local safety log records baseline/check summaries in `.safe-change/log.json`. It is operational history, not authenticated verification evidence or the separate tamper-evident event chain.

These descriptions follow current source; older published versions may differ. Keep `.safe-change/` ignored and review already tracked files. The tool does not automatically remove tracked state or its Git history.

## Actual storage format

The file is a **JSON array**, not a versioned object containing an `entries` field:

```json
[
  {
    "id": "c1f7a28e-5b12-4d3a-96e1-88f192b8d001",
    "timestamp": "2026-10-20T02:30:00.000Z",
    "trigger": "cli",
    "baselineId": "baseline-identifier",
    "description": "Before refactor",
    "checkResults": [
      { "name": "build", "result": "pass-pass", "before": "pass", "now": "pass" }
    ],
    "fileSummary": { "added": 0, "modified": 1, "deleted": 0, "unchanged": 128 },
    "regressionDetected": false,
    "durationMs": 1420
  }
]
```

Each entry contains a UUID, timestamp, optional description, baseline identifier, origin (`cli`, `mcp` or `manual`), check comparisons, file summary, regression flag and nullable duration. It does not store a separate `gitBranch` or per-check `durationMs` field. Consult the `LogEntry` and `LogCheckResult` TypeScript types for the complete result vocabulary.

## CLI usage

```bash
# Default: last 10 entries
safe-change log

# Select a display count or the entire history
safe-change log --last 5
safe-change log --all --json

# Export all readable stored entries; destination parent must already exist
safe-change log --export ./reports/safety-audit.json

# Explicitly discard history
safe-change log --clear
```

Clear asks for confirmation when stdin is an interactive TTY unless `--non-interactive` is passed. Non-TTY callers must therefore treat `--clear` as destructive; they must not assume a confirmation prompt will appear.

```bash
safe-change log --clear --non-interactive
```

Exports are explicit writes to the caller-selected destination. Review that path and its parent permissions; the private internal-state writer does not sandbox arbitrary export paths.

## Retention

Append retains the newest 100 entries by default. Set `logRetention` in configuration to choose a positive integer:

```json
{
  "version": 1,
  "logRetention": 250,
  "checks": [
    { "name": "test", "executable": "npm", "args": ["test"] }
  ]
}
```

Log mutations use both an in-process queue and a cooperative cross-process `log-write.lock` on the local filesystem. Independent cooperating processes wait up to 10 seconds rather than silently overwriting another writer. A crashed writer leaves its marker for explicit offline recovery; locks never auto-expire or get stolen. This is not a distributed or repository-wide transaction.

## Integrity and recovery

Append, update, prune and export refuse malformed/unreadable history and preserve the original file. Only an explicit clear can deliberately replace malformed contents. Do not delete or clear a damaged file before preserving evidence you need.

CLI listing exits with code 5 for corrupt/unreadable history rather than printing a successful empty array. The dashboard `/api/log` responds with HTTP 500 and the MCP log tool returns `isError: true`. Missing history remains a successful empty array. Entries are validated against the public shape; unknown extension fields are preserved, but missing/wrongly typed fields and invalid counts, durations or check states/results are rejected.

Only the low-level legacy `readEntries` API keeps its tolerant empty-on-error behavior for compatibility. Use `readEntriesStrict` for integrations that need to distinguish corruption from absence.

If `log-write.lock` remains after a crash, first stop and verify the exit of every possible writer. Back up and inspect the state, then remove only that abandoned marker while writers remain stopped. Age and PID alone are not sufficient evidence that a lock is abandoned. See the recovery steps below before retrying.

Baseline/log reads and writes reject linked state paths and files larger than 64 MiB; new state files request private permissions and use exclusive temporary files. See [state storage boundaries and recovery](state-storage.md) for exact coverage, Windows ACL limits and the remaining same-user race and distributed-filesystem limitations.
