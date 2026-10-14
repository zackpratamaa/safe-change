export interface QualityReportVerdict {
  schemaVersion: 1; status: 'PASS_REPORTED' | 'FAIL' | 'NOT_VERIFIED';
  format: string; inspected: number; reasons: string[]; limitations: string[];
}
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
/** Import assessment only. The JSON producer, revision and execution are NOT authenticated. */
export function evaluateQualityReport(format: string, value: unknown): QualityReportVerdict {
  let inspected = 0;
  const verdict = (status: QualityReportVerdict['status'], reason: string): QualityReportVerdict => ({ schemaVersion: 1, status, format, inspected, reasons: [reason], limitations: ['Report contents only; no signature, execution, source-binding or freshness authentication.', 'Regenerate reports in the same trusted check invocation; never use a stale JSON file as current scanner evidence.'] });
  const report = object(value);
  if (!report) return verdict('NOT_VERIFIED', 'Expected a report object');
  if (format === 'sarif') {
    if (report['version'] !== '2.1.0' || !Array.isArray(report['runs']) || !report['runs'].length) return verdict('NOT_VERIFIED', 'Expected nonempty SARIF 2.1.0 runs');
    for (const raw of report['runs']) {
      const run = object(raw); const driver = object(object(run?.['tool'])?.['driver']);
      if (!run || typeof driver?.['name'] !== 'string' || !driver['name'] || !Array.isArray(run['results']) || !Array.isArray(run['invocations']) || !run['invocations'].length) return verdict('NOT_VERIFIED', 'Run metadata, results or invocations missing');
      for (const rawInvocation of run['invocations']) {
        const invocation = object(rawInvocation);
        if (!invocation || invocation['executionSuccessful'] !== true) return verdict('NOT_VERIFIED', 'Scanner invocation did not report successful execution');
        for (const key of ['toolExecutionNotifications', 'toolConfigurationNotifications']) {
          const notifications = invocation[key];
          if (notifications !== undefined && (!Array.isArray(notifications) || notifications.some(n => object(n)?.['level'] !== 'note'))) return verdict('NOT_VERIFIED', 'Scanner reported warning, error or malformed notifications');
        }
      }
      inspected += run['results'].length;
    }
    return inspected ? verdict('FAIL', 'SARIF contains findings, including suppressed or informational results requiring review') : verdict('PASS_REPORTED', 'Declared scanner runs completed with zero reported results; scanned coverage remains unproven');
  }
  if (format === 'playwright') {
    const stats = object(report['stats']);
    if (!stats || !['expected','unexpected','flaky','skipped'].every(k => Number.isInteger(stats[k]) && (stats[k] as number) >= 0) || !Array.isArray(report['errors']) || !Array.isArray(report['suites'])) return verdict('NOT_VERIFIED', 'Playwright counts, errors or suites missing');
    if (report['errors'].length || stats['unexpected'] || stats['flaky'] || stats['skipped']) return verdict('FAIL', 'Browser report contains errors, failures, flaky or skipped tests');
    const queue: unknown[] = [...report['suites']];
    let visited = 0;
    while (queue.length) {
      if (++visited > 10000) return verdict('NOT_VERIFIED', 'Browser report exceeds traversal budget');
      const suite = object(queue.pop());
      if (!suite || !Array.isArray(suite['specs']) || (suite['suites'] !== undefined && !Array.isArray(suite['suites']))) return verdict('NOT_VERIFIED', 'Malformed browser suite');
      if (Array.isArray(suite['suites'])) queue.push(...suite['suites']);
      for (const rawSpec of suite['specs']) {
        const spec = object(rawSpec);
        if (!spec || spec['ok'] !== true || !Array.isArray(spec['tests']) || !spec['tests'].length) return verdict('FAIL', 'Browser specification is empty or not successful');
        for (const rawTest of spec['tests']) {
          const test = object(rawTest);
          if (!test || test['status'] !== 'expected' || test['expectedStatus'] !== 'passed' || !Array.isArray(test['results']) || !test['results'].length || test['results'].some(r => object(r)?.['status'] !== 'passed')) return verdict('FAIL', 'Browser test has not passed cleanly; expected failures and retries need review');
          inspected++;
        }
      }
    }
    if (!inspected || inspected !== stats['expected']) return verdict('NOT_VERIFIED', 'No executed tests or inconsistent browser counts');
    return verdict('PASS_REPORTED', 'Positive, internally consistent browser test results; assertion quality requires review');
  }
  return verdict('NOT_VERIFIED', 'Unsupported report format; use sarif or playwright');
}
