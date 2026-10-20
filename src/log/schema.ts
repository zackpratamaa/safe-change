import type { LogEntry } from "../types/index.js";

const RESULTS = new Set([
  "pass-pass", "pass-fail", "fail-fail", "fail-pass", "pass-timeout", "fail-timeout",
  "timeout-pass", "timeout-fail", "timeout-timeout", "config-removed", "config-added",
  "unverified", "definition-changed",
]);
const STATES = new Set(["pass", "fail", "timeout", "unverified"]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Validate the stored public shape without coercing types or removing unknown fields. */
export function isLogEntry(value: unknown): value is LogEntry {
  if (!record(value)) return false;
  const summary = value["fileSummary"];
  const checks = value["checkResults"];
  return typeof value["id"] === "string" && value["id"].length > 0 &&
    typeof value["timestamp"] === "string" && Number.isFinite(Date.parse(value["timestamp"])) &&
    (value["description"] === null || typeof value["description"] === "string") &&
    typeof value["baselineId"] === "string" &&
    (value["trigger"] === "cli" || value["trigger"] === "mcp" || value["trigger"] === "manual") &&
    typeof value["regressionDetected"] === "boolean" &&
    (value["durationMs"] === null || nonnegative(value["durationMs"])) &&
    record(summary) && ["added", "modified", "deleted", "unchanged"].every(key =>
      nonnegative(summary[key]) && Number.isSafeInteger(summary[key])) &&
    Array.isArray(checks) && checks.every(check => record(check) &&
      typeof check["name"] === "string" && typeof check["result"] === "string" && RESULTS.has(check["result"]) &&
      typeof check["before"] === "string" && STATES.has(check["before"]) &&
      typeof check["now"] === "string" && STATES.has(check["now"]));
}
