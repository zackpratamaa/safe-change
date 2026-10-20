import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const MAX_STATE_BYTES = 64 * 1024 * 1024;

export class StateFileError extends Error {
  constructor(message: string) { super(message); this.name = "StateFileError"; }
}

function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function validateName(name: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.length > 128) {
    throw new StateFileError("State file name must be a single simple filename.");
  }
}

async function stateDirectory(repoRoot: string, create: boolean): Promise<string | null> {
  const directory = join(repoRoot, ".safe-change");
  if (create) {
    try { await mkdir(directory, { mode: 0o700 }); }
    catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    }
  }
  try {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new StateFileError("State directory must be a real directory, not a symbolic link.");
    }
  } catch (error) {
    if (!create && missing(error)) return null;
    throw error;
  }
  return directory;
}

/** Validate/create the private state directory without following a linked leaf. */
export async function ensureStateDirectory(repoRoot: string): Promise<string> {
  return (await stateDirectory(repoRoot, true))!;
}

async function inspectFile(path: string) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
      throw new StateFileError("State file must be a regular, singly linked file.");
    }
    return info;
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

/** Bounded read; absent state is null, unsafe or unreadable state is an error. */
export async function readStateFile(repoRoot: string, name: string): Promise<string | null> {
  validateName(name);
  const directory = await stateDirectory(repoRoot, false);
  if (directory === null) return null;
  const path = join(directory, name);
  const expected = await inspectFile(path);
  if (expected === null) return null;
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const actual = await handle.stat();
    if (!actual.isFile() || actual.nlink !== 1 || actual.dev !== expected.dev || actual.ino !== expected.ino) {
      throw new StateFileError("State file changed during open or is not a regular file.");
    }
    if (actual.size > MAX_STATE_BYTES) throw new StateFileError("State file exceeds the 64 MiB limit.");
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_STATE_BYTES - total + 1));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > MAX_STATE_BYTES) throw new StateFileError("State file exceeds the 64 MiB limit.");
      chunks.push(buffer.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, total).toString("utf8");
  } finally { await handle.close(); }
}

/** Exclusive private temporary file, flush, then same-directory atomic rename. */
export async function writeStateFileAtomically(repoRoot: string, name: string, content: string): Promise<string> {
  validateName(name);
  if (Buffer.byteLength(content, "utf8") > MAX_STATE_BYTES) throw new StateFileError("State file exceeds the 64 MiB limit.");
  const directory = (await stateDirectory(repoRoot, true))!;
  const target = join(directory, name);
  await inspectFile(target);
  const temporary = join(directory, `${name}.tmp.${randomUUID()}`);
  let created = false;
  let published = false;
  try {
    const handle = await open(temporary, "wx", 0o600);
    created = true;
    try { await handle.writeFile(content, "utf8"); await handle.sync(); }
    finally { await handle.close(); }
    await stateDirectory(repoRoot, false);
    await inspectFile(target);
    await rename(temporary, target);
    published = true;
    return target;
  } finally {
    if (created && !published) {
      try { await unlink(temporary); } catch { /* Best-effort cleanup; original failure remains authoritative. */ }
    }
  }
}
