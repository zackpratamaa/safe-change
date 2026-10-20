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

All log read-modify-write operations in this Node.js process share a queue keyed by the canonical repository root. Concurrent appends, updates, pruning and explicit clears do not independently read the same old array and silently discard one another's updates.

This is **not a cross-process lock**. Coordinate independent CLI processes and agents with a single-writer workflow/cooperative lease; atomic rename alone does not solve cross-process lost updates. This increment does not automatically acquire an enterprise lease for every CLI operation.

Append, update, prune and export reject unreadable or malformed existing history instead of replacing it with an empty array. Missing history starts empty. The compatibility display API `readEntries` still returns an empty array on read failure; an empty display is not proof that no history exists.

For recovery:

1. Stop independent writers.
2. Inspect the state path, permissions and original file. Preserve a separate backup with a trusted filesystem tool if needed; the strict export operation cannot export malformed JSON.
3. Repair or restore the file, or deliberately run `safe-change log --clear` to discard its contents. Clear remains explicit and still refuses linked/non-regular destinations.
4. Retry the operation. An unsuccessful queued operation does not block future operations in the process.

## Git exclusion

Baseline warnings, init and doctor use Git's effective ignore behavior rather than substring matching. Baseline exclusion additionally rejects any already tracked `.safe-change` files. An ignore rule does not remove previously committed data or its history.

Run `safe-change init --update-gitignore` only when you intend to edit `.gitignore`, then inspect tracked state separately. These controls do not remove secrets that have already been committed.

## Validation scope

Regression tests cover read-only missing reads, ordinary Unicode round trips, private POSIX creation modes, state-directory links/junctions, file symlinks on POSIX, hard links, non-regular destinations, size bounds, simulated rename failure and temporary-file cleanup. Log tests cover concurrent in-process writers, equivalent roots, retention, rejected corruption and explicit recovery. Windows ACL certification and adversarial parent-directory race freedom are not claimed.
