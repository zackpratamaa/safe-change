#!/usr/bin/env bash
# Preserve the compiler exit code, while making bounded failure diagnostics
# available as an Actions annotation even when full logs require sign-in.
set -uo pipefail
log="$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/safe-change-native.XXXXXX")"
if (
  cd crates/safe-change-native || exit 1
  if [ "$1" = "linux-x64-musl" ]; then
    # Build against an actual musl userspace and its libgcc, not Ubuntu's
    # glibc compiler runtime. Execution proof remains a separate Alpine step.
    docker run --rm -v "$PWD/../..:/workspace" -w /workspace rust:1.90-alpine sh -ec '
      apk add --no-cache nodejs npm build-base libgcc
      npm ci
      cd crates/safe-change-native
      RUSTFLAGS="-C target-feature=-crt-static" npx napi build --platform --release
    '
  else
    npx napi build --platform --release
  fi
) 2>&1 | tee "$log"; then
  rm -f "$log"
else
  status=$?
  CI_NATIVE_BUILD_LOG="$log" node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const text = readFileSync(process.env.CI_NATIVE_BUILD_LOG, "utf8").slice(-12000)
      .replace(/\x1b\[[0-9;]*m/g, "")
      .replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
    console.error("::error title=Native compiler failure::" + text);
  '
  rm -f "$log"
  exit "$status"
fi
