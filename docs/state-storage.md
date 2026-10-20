# Baseline and log storage boundaries

These changes describe source, not an already published npm version. They apply to `baseline.json` and `log.json`; other `.safe-change` artifacts are not automatically covered.

## Filesystem behavior

- Missing reads return no state without creating directories.
- The `.safe-change` directory must be a real directory. Symlinks and Windows junctions are rejected.
- Existing baseline/log files must be regular files with one hard link. Linked files, dangling links, directories and other special files are rejected rather than followed.
- New state directories request mode `0700`; temporary state files request mode `0600`. Existing directory permissions are not silently changed. Windows privacy depends on the directory's ACL, not POSIX mode bits.
- Writes use a UUID-named file opened exclusively, flush the file, close it and rename within the same directory. A failed publication preserves the previous destination and attempts to remove the operation's own temporary file.
- Reads and writes have a 64 MiB per-file ceiling. Oversized existing files are rejected, not truncated or automatically deleted.
- Reads use file-handle checks and `O_NOFOLLOW` where supported. This reduces accidental link following; it is not a portable directory-handle sandbox or a guarantee against a malicious same-user process swapping parent directories between checks.
- Atomic replacement avoids publishing partial JSON. It does not establish crash-proof transactions across files, full power-loss durability on every filesystem, or authenticity of local data.

## Log concurrency and recovery

All log read-modify-write operations share a queue keyed by the canonical repository root and acquire `.safe-change/log-write.lock` before reading or changing history. Independent cooperating CLI/agent processes use exclusive file creation to take this short-lived lock. Contenders wait up to 10 seconds, then fail without starting their mutation. Releases check the marker's file identity and unique owner record; changed markers are preserved, not unlinked.

This lock covers append, update, prune and clear of the log only. It is not the enterprise workspace lease, a repository-wide transaction, a reentrant lock, a distributed/NFS locking guarantee, or protection from a malicious same-user process. Old versions and direct filesystem writers do not cooperate with it. A successful mutation followed by a release failure can return an error after history changed; inspect state before retrying to avoid duplicating an append.

Locks **never automatically expire or get stolen**, even when a recorded PID appears dead. A terminated writer can leave its marker behind. Recovery must be deliberate:

1. Stop and confirm the exit of **all** CLI processes, MCP servers and agents that might write this repository. Do not remove a lock based only on its age or PID; PIDs can be reused.
2. Inspect `.safe-change/log-write.lock`, state paths, permissions and original log. Preserve a separate backup with a trusted filesystem tool if needed. Strict export cannot export malformed history.
3. Only while all possible owners remain stopped, remove the leftover `log-write.lock` marker with a trusted filesystem tool. There is no automatic force-unlock command.
4. Repair/restore malformed history, or deliberately run `safe-change log --clear --non-interactive` to discard it. Clear still refuses linked/non-regular destinations and must acquire the lock.
5. Restart writers and retry. A failed operation does not poison the in-process queue.

Strict reads validate the complete public entry shape, including finite durations, nonnegative integer file counts and known check states/results. Malformed JSON, invalid entries, unsafe paths and unreadable files produce an error, not fabricated empty history. Unknown extension fields are retained. Missing history alone starts empty.

The CLI (`safe-change log`), dashboard `/api/log`, MCP log tool, mutation and export paths use strict reads. The legacy low-level `readEntries` compatibility API still returns `[]` on read failure; applications needing integrity diagnostics must use `readEntriesStrict` instead. Dashboard API errors do not promise a particular visual error treatment in every client.

## Git exclusion

Baseline warnings, init and doctor use Git's effective ignore behavior rather than substring matching. Baseline exclusion additionally rejects any already tracked `.safe-change` files. An ignore rule does not remove previously committed data or its history.

Run `safe-change init --update-gitignore` only when you intend to edit `.gitignore`, then inspect tracked state separately. These controls do not remove secrets that have already been committed.

## Validation scope

Regression tests cover read-only missing reads, ordinary Unicode round trips, private POSIX creation modes, state-directory links/junctions, file symlinks on POSIX, hard links, non-regular destinations, size bounds, simulated rename failure and temporary-file cleanup. Log tests cover concurrent in-process writers, six independent processes appending 48 distinct records, equivalent roots, retention, owner-record changes, contention timeouts, a terminated fixture writer leaving a lock, schema rejection, CLI/dashboard API/MCP error reporting and explicit recovery. Windows ACL certification and adversarial parent-directory race freedom are not claimed.
