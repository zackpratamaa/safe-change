import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { createHash } from "node:crypto";

/** Local observation only: equal-privilege ancestor replacement and rewritten
 * manifests remain outside this boundary. No claim of OS-level confinement. */
export async function hashReplayArtifact(root: string, relativePath: string): Promise<string | null> {
  const parts = relativePath.split(/[\\/]/);
  if (!relativePath || isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath) ||
      parts.some(part => !part || part === "." || part === ".." || part.includes("\0"))) return null;
  try {
    let current = await realpath(root);
    for (const part of parts.slice(0, -1)) {
      current = join(current, part);
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) return null;
    }
    const path = join(current, parts[parts.length - 1]!);
    const before = await lstat(path);
    if (!before.isFile() || before.nlink !== 1) return null;
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const actual = await handle.stat();
      if (!actual.isFile() || actual.nlink !== 1 || actual.dev !== before.dev || actual.ino !== before.ino) return null;
      return createHash("sha256").update(await handle.readFile()).digest("hex");
    } finally { await handle.close(); }
  } catch { return null; }
}
