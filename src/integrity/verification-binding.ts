import { isAbsolute, relative } from "node:path";
import type {
  Baseline, FileEntry, SafeChangeConfig, VerificationBinding,
} from "../types/index.js";
import { getFileEntries } from "../git/inspector.js";
import { captureWorkspaceFingerprint } from "./fingerprint.js";
import { stableDigest } from "./hash.js";
import { matchGlob } from "../rules/engine.js";

/** Only Git-visible inputs are covered; ignored artifacts and external inputs are not. */
export function sourceDigest(files: Readonly<Record<string, FileEntry>>): string {
  return stableDigest(Object.fromEntries(Object.entries(files).map(([name, entry]) => [
    name, { hash: entry.worktreeHash, indexHash: entry.indexHash, tracked: entry.tracked },
  ])));
}

export async function captureVerificationBinding(
  repoRoot: string, config: SafeChangeConfig, baseline: Baseline,
  files?: Readonly<Record<string, FileEntry>>,
): Promise<VerificationBinding> {
  const fingerprint = await captureWorkspaceFingerprint(repoRoot, config);
  return {
    schemaVersion: 1,
    sourceDigest: sourceDigest(files ?? await getFileEntries(repoRoot)),
    baselineDigest: stableDigest(baseline),
    environmentDigest: fingerprint.digest,
  };
}

export function bindingsMatch(
  expected: VerificationBinding | undefined, current: VerificationBinding,
): boolean {
  return expected?.schemaVersion === 1 &&
    expected.sourceDigest === current.sourceDigest &&
    expected.baselineDigest === current.baselineDigest &&
    expected.environmentDigest === current.environmentDigest;
}

/** Conservative oracle guard: named tests plus repository-local command scripts. */
export function changedVerificationInputs(
  repoRoot: string, baseline: Baseline,
  current: Readonly<Record<string, FileEntry>>, config: SafeChangeConfig,
): string[] {
  const commandFiles = new Set(config.checks.flatMap(check => check.args)
    .map(arg => isAbsolute(arg) ? relative(repoRoot, arg) : arg)
    .map(arg => arg.replace(/\\/g, "/").replace(/^\.\//, ""))
    .filter(arg => !arg.startsWith("../") && /\.(?:[cm]?js|tsx?|jsx|py|sh|ps1)$/.test(arg)));
  const names = new Set([...Object.keys(baseline.files), ...Object.keys(current)]);
  return [...names].filter(name => {
    const protectedInput = /(^|\/)(__tests__|tests?|specs?)(\/|$)/i.test(name) ||
      /\.(test|spec)\.[^/]+$/i.test(name) ||
      commandFiles.has(name) ||
      (config.protectedVerificationPaths ?? []).some(pattern => matchGlob(name, pattern));
    return protectedInput &&
      baseline.files[name]?.worktreeHash !== current[name]?.worktreeHash;
  }).sort();
}