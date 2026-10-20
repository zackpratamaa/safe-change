#!/usr/bin/env bash
# Full suite, unchanged assertions and preserved exit code. The annotation is
# bounded and PEM-redacted; success cannot be manufactured by a pipe or tee.
set -uo pipefail
log="$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/safe-change-tests.XXXXXX")"
if npm test -- --reporter=default --reporter=github-actions --reporter=json --outputFile=.safe-change-ci-test-results.json 2>&1 | tee "$log"; then
  rm -f "$log"
else
  status=$?
  CI_FALLBACK_LOG="$log" node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const raw = readFileSync(process.env.CI_FALLBACK_LOG, "utf8")
      .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]")
      .replace(/\x1b\[[0-9;]*m/g, "");
    const lines = raw.split("\n");
    const contexts = [];
    for (let i = 0; i < lines.length; i++) {
      if (/AssertionError|^\s*FAIL\b|Unhandled|ERR_|EAGAIN|SIG[A-Z]+|[Ww]orker.*(?:exit|error)|^\s*[A-Za-z]*Error:/.test(lines[i]))
        contexts.push(lines.slice(Math.max(0, i - 2), i + 8).join("\n"));
    }
    let structured = "JSON reporter result unavailable; test execution may have terminated before reporting.";
    try {
      const report = JSON.parse(readFileSync(".safe-change-ci-test-results.json", "utf8"));
      structured = JSON.stringify({ success: report.success, failed: report.numFailedTests,
        pending: report.numPendingTests, errors: report.testResults?.filter(result => result.status === "failed") });
    } catch {}
    const text = (structured.slice(-5000) + "\n" + contexts.join("\n").slice(-9000) + "\nFinal output:\n" + lines.slice(-12).join("\n")).slice(-16000)
      .replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
    console.error("::error title=Fallback test failure::" + text);
  '
  rm -f "$log"
  exit "$status"
fi
