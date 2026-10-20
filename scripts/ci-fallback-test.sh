#!/usr/bin/env bash
# Full suite, unchanged assertions and preserved exit code. The annotation is
# bounded and PEM-redacted; success cannot be manufactured by a pipe or tee.
set -uo pipefail
log="$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/safe-change-tests.XXXXXX")"
if npm test -- --reporter=default --reporter=github-actions 2>&1 | tee "$log"; then
  rm -f "$log"
else
  status=$?
  CI_FALLBACK_LOG="$log" node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const text = readFileSync(process.env.CI_FALLBACK_LOG, "utf8")
      .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]")
      .slice(-12000).replace(/\x1b\[[0-9;]*m/g, "")
      .replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
    console.error("::error title=Fallback test failure::" + text);
  '
  rm -f "$log"
  exit "$status"
fi
