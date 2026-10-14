import { loadConfig } from '../config/loader.js';
import { loadBaseline } from '../baseline/manager.js';
import { getRepositoryRoot } from '../git/inspector.js';
import { bindingsMatch, captureVerificationBinding } from '../integrity/verification-binding.js';
import { readQualityFile } from './files.js';

export interface QualityPolicy { version: 1; requiredChecks: string[]; maxAgeSeconds: number }
export interface QualityGate { schemaVersion: 1; status: 'PASS' | 'FAIL' | 'NOT_VERIFIED'; reasons: string[] }
export function validateQualityPolicy(value: unknown): QualityPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Quality policy must be an object');
  const p = value as Record<string, unknown>;
  if (Object.keys(p).some(k => !['version', 'requiredChecks', 'maxAgeSeconds'].includes(k)) || p['version'] !== 1 || !Array.isArray(p['requiredChecks']) || !p['requiredChecks'].length || p['requiredChecks'].length > 100 || p['requiredChecks'].some(n => typeof n !== 'string' || !n.trim() || n.length > 128 || /[\x00-\x1f\x7f]/.test(n)) || new Set(p['requiredChecks']).size !== p['requiredChecks'].length || !Number.isInteger(p['maxAgeSeconds']) || (p['maxAgeSeconds'] as number) < 1 || (p['maxAgeSeconds'] as number) > 86400) throw new Error('Expected version 1, unique requiredChecks, and maxAgeSeconds from 1 to 86400');
  return p as unknown as QualityPolicy;
}

/** Cooperative, current-evidence gate; never runs tools or authenticates the report author. */
export async function qualityGate(root: string, policy: QualityPolicy, now = Date.now()): Promise<QualityGate> {
  policy = validateQualityPolicy(policy);
  root = await getRepositoryRoot(root);
  const result = (status: QualityGate['status'], reason: string): QualityGate => ({ schemaVersion: 1, status, reasons: [reason] });
  try {
    const summary = JSON.parse(await readQualityFile(root, '.safe-change/last-verification-summary.json'));
    if (!summary || summary.schemaVersion !== 1 || !Array.isArray(summary.checks)) return result('NOT_VERIFIED', 'Malformed verification evidence');
    const age = now - Date.parse(summary.generatedAt);
    if (!Number.isFinite(age) || age < 0 || age > policy.maxAgeSeconds * 1000) return result('NOT_VERIFIED', 'Missing, future or expired verification timestamp');
    const config = await loadConfig(root);
    const baseline = await loadBaseline(root);
    if (!baseline || !bindingsMatch(summary.verificationBinding, await captureVerificationBinding(root, config, baseline))) return result('NOT_VERIFIED', 'Evidence no longer matches source, baseline or environment');
    if (summary.state === 'failed') return result('FAIL', 'Verification reports failure');
    if (summary.state !== 'verified' || summary.exitCode !== 0) return result('NOT_VERIFIED', 'Strict verification has not passed');
    const names = summary.checks.map((c: { name?: unknown } | null) => c?.name);
    if (names.some((n: unknown) => typeof n !== 'string') || new Set(names).size !== names.length) return result('NOT_VERIFIED', 'Ambiguous check evidence');
    for (const name of policy.requiredChecks) {
      const check = summary.checks.find((c: { name: string }) => c.name === name);
      if (!config.checks.some(c => c.name === name) || !check) return result('NOT_VERIFIED', `Required check missing: ${name}`);
      if (check.exitCode !== 0 || check.timedOut !== false || check.outputBlocked !== false || !Array.isArray(check.detectedSecretTypes) || check.detectedSecretTypes.length) return result('FAIL', `Required check did not pass cleanly: ${name}`);
    }
    return result('PASS', 'Required checks passed with current, age-bounded evidence; scope is limited to those checks');
  } catch {
    return result('NOT_VERIFIED', 'Evidence unavailable, unsafe or invalid; run configured checks on stable inputs');
  }
}
