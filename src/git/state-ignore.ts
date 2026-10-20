import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const STATE_INPUTS = [
  ".safe-change/baseline.json", ".safe-change/log.json", ".safe-change/events.jsonl",
];

/** Ask Git itself: comments, lookalike paths, negations and global rules matter. */
export async function isStateIgnored(repoRoot: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("git", ["check-ignore", "--no-index", "--", ...STATE_INPUTS], {
      cwd: repoRoot, encoding: "utf8", timeout: 5000, maxBuffer: 4096,
    });
    const ignored = new Set(stdout.split(/\r?\n/).filter(Boolean));
    return STATE_INPUTS.every(path => ignored.has(path));
  } catch (error: unknown) {
    if ((error as { code?: unknown }).code === 1) return false;
    throw error;
  }
}

/** An ignore rule does not remove state files already present in the index. */
export async function hasTrackedState(repoRoot: string): Promise<boolean> {
  const { stdout } = await execFileAsync("git", ["ls-files", "--", ".safe-change/"], {
    cwd: repoRoot, encoding: "utf8", timeout: 5000, maxBuffer: 64 * 1024,
  });
  return stdout.trim().length > 0;
}
