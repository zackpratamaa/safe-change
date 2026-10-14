import type { OutputFormat } from '../types/index.js';
import { getRepositoryRoot } from '../git/inspector.js';
import { redactSecrets } from '../security/secret-redactor.js';
import { scanQuality } from '../quality/scan.js';
import { qualityGate, validateQualityPolicy } from '../quality/gate.js';
import { readQualityFile } from '../quality/files.js';
import { evaluateQualityReport } from '../quality/reports.js';
import { QUALITY_PROFILES, qualityProfile } from '../quality/profiles.js';

export async function runQuality(options: { values: string[]; file?: string; format: OutputFormat }): Promise<number> {
  try {
    const [action, id, ...extra] = options.values;
    if (extra.length || (!['profile', 'report'].includes(action ?? '') && id)) throw new Error('Unexpected quality arguments');
    let report: unknown;
    let code = 0;
    if (action === 'profile') {
      if (options.file) throw new Error('profile does not accept --file');
      report = id ? qualityProfile(id) : QUALITY_PROFILES;
    } else if (action === 'scan') {
      if (options.file) throw new Error('scan does not accept --file');
      const scan = await scanQuality(process.cwd());
      report = scan; code = scan.status === 'CLEAN_LIMITED' ? 0 : 1;
    } else if (action === 'report') {
      if (!id || !['sarif', 'playwright'].includes(id) || !options.file) throw new Error('quality report requires sarif|playwright and --file <repository-relative JSON>');
      const root = await getRepositoryRoot(process.cwd());
      const assessment = evaluateQualityReport(id, JSON.parse(await readQualityFile(root, options.file, 8 * 1024 * 1024)));
      report = assessment; code = assessment.status === 'PASS_REPORTED' ? 0 : 1;
    } else if (action === 'gate') {
      if (!options.file) throw new Error('quality gate requires --file with a repository-relative policy path');
      const root = await getRepositoryRoot(process.cwd());
      const policy = validateQualityPolicy(JSON.parse(await readQualityFile(root, options.file, 65536)));
      const gate = await qualityGate(root, policy);
      report = gate; code = gate.status === 'PASS' ? 0 : 1;
    } else throw new Error('Use quality scan | profile [id] | report <format> --file <report.json> | gate --file <policy.json>');
    process.stdout.write(JSON.stringify(report, null, options.format === 'json' ? 0 : 2) + '\n');
    return code;
  } catch (error: unknown) {
    // Do not echo raw scanner output, snippets, or arbitrary input errors.
    const message = redactSecrets(error instanceof Error ? error.message : 'Quality command failed').text;
    process.stderr.write(JSON.stringify({ status: 'ERROR', message }) + '\n');
    return 3;
  }
}
