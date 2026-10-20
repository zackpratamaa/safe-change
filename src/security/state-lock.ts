import { lstat, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { ensureStateDirectory, readStateFile } from "./state-files.js";

export class StateLockError extends Error {
  constructor(message: string) { super(message); this.name = "StateLockError"; }
}
export class StateLockTimeoutError extends StateLockError {
  constructor() {
    super("State lock acquisition timed out (contention or Windows filesystem access/sharing); no mutation was started by this operation. Stop or finish other writers and retry. Never delete a lock until all possible owners are stopped.");
    this.name = "StateLockTimeoutError";
  }
}
interface Identity { dev: number; ino: number }
interface OwnedLock { identity: Identity; record: string }

function code(error: unknown, expected: string): boolean {
  return error instanceof Error && "code" in error && error.code === expected;
}

// Windows may report a delete-pending/sharing observation as EPERM/EACCES,
// not EEXIST/ENOENT. Treat it only as a bounded acquisition failure: ownership
// still requires successful wx creation. A permanent denial times out closed.
function windowsAcquisitionConflict(error: unknown): boolean {
  return process.platform === "win32" && (code(error, "EPERM") || code(error, "EACCES"));
}

async function release(repoRoot: string, name: string, path: string, identity: Identity, expectedRecord?: string): Promise<void> {
  const current = await lstat(path);
  if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1 ||
      current.dev !== identity.dev || current.ino !== identity.ino ||
      (expectedRecord !== undefined && await readStateFile(repoRoot, name) !== expectedRecord)) {
    throw new StateLockError("State lock ownership changed; the current lock was preserved. A mutation may already have completed; inspect state before retrying.");
  }
  await unlink(path);
}

async function acquire(repoRoot: string, name: string, path: string, timeoutMs: number): Promise<OwnedLock> {
  const started = performance.now();
  while (true) {
    let handle;
    try { handle = await open(path, "wx", 0o600); }
    catch (error) {
      if (!code(error, "EEXIST") && !windowsAcquisitionConflict(error)) throw error;
      try {
        const existing = await lstat(path);
        // A lookup racing the previous owner's unlink can observe a regular inode
        // with no links. This is only a contention observation, never ownership:
        // keep the same deadline and retry exclusive creation below.
        if (!existing.isFile() || existing.isSymbolicLink() || (existing.nlink !== 0 && existing.nlink !== 1)) {
          throw new StateLockError("State lock must be a regular, singly linked file. Existing path was preserved.");
        }
      } catch (inspectionError) {
        if (!code(inspectionError, "ENOENT") && !windowsAcquisitionConflict(inspectionError)) throw inspectionError;
      }
      const remaining = timeoutMs - (performance.now() - started);
      if (remaining <= 0) throw new StateLockTimeoutError();
      await delay(Math.min(25, remaining));
      continue;
    }
    let identity: Identity | undefined;
    const ownerRecord = JSON.stringify({ schemaVersion: 1, token: randomUUID(), pid: process.pid, createdAt: new Date().toISOString() }) + "\n";
    try {
      try {
        identity = await handle.stat();
        await handle.writeFile(ownerRecord, "utf8");
        await handle.sync();
      } finally { await handle.close(); }
    } catch (error) {
      if (identity) {
        try { await release(repoRoot, name, path, identity); } catch { /* Preserve a changed or unremovable path. */ }
      }
      throw error;
    }
    return { identity: identity!, record: ownerRecord };
  }
}

/** Cooperative local-filesystem lock. Never steals or automatically expires a lock. */
export async function withStateLock<T>(
  repoRoot: string,
  name: string,
  operation: () => Promise<T>,
  options: { timeoutMs?: number } = {}
): Promise<T> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)) throw new StateLockError("Lock name must be a simple filename.");
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 60_000) throw new StateLockError("Lock timeout must be an integer from 0 to 60000 ms.");
  const directory = await ensureStateDirectory(repoRoot);
  const path = join(directory, name);
  const owner = await acquire(repoRoot, name, path, timeoutMs);
  let result: T | undefined;
  let failed = false;
  let operationError: unknown;
  try { result = await operation(); }
  catch (error) { failed = true; operationError = error; }
  try { await release(repoRoot, name, path, owner.identity, owner.record); }
  catch (releaseError) {
    if (failed) throw new AggregateError([operationError, releaseError], "State operation failed and its lock could not be safely released.");
    throw releaseError;
  }
  if (failed) throw operationError;
  return result as T;
}
