import { describe, expect, it } from "vitest";
import { isLogEntry } from "../../src/log/schema.js";
import { createLogEntry } from "../../src/log/log-manager.js";

const entry = () => createLogEntry({ description: null, baselineId: "baseline", trigger: "cli", checkResults: [], fileSummary: { added: 0, modified: 1, deleted: 0, unchanged: 3 }, regressionDetected: false, durationMs: null });
describe("stored log schema", () => {
  it("accepts current entries, nullable fields, all origins and unknown extension fields", () => {
    for (const trigger of ["cli", "mcp", "manual"]) {
      expect(isLogEntry({ ...entry(), trigger, extra: { future: true } })).toBe(true);
      expect(isLogEntry({ ...entry(), trigger, description: "ok", durationMs: 1.5 })).toBe(true);
    }
  });
  it.each([null, [], 1, "entry", undefined])("rejects a non-record %j", value => { expect(isLogEntry(value)).toBe(false); });
  it.each([
    ["id", ""], ["id", 1], ["timestamp", "not-a-date"], ["timestamp", 3],
    ["description", {}], ["baselineId", null], ["trigger", "agent"],
    ["regressionDetected", 0], ["durationMs", -1], ["durationMs", Infinity], ["durationMs", "1"],
    ["fileSummary", null], ["fileSummary", []], ["fileSummary", {}],
    ["checkResults", null], ["checkResults", {}], ["checkResults", [null]],
    ["checkResults", [{ name: "test", result: "pass-pass", before: "pass", now: "unknown" }]],
    ["checkResults", [{ name: "test", result: "pass-pass", before: "unknown", now: "pass" }]],
    ["checkResults", [{ name: "test", result: "made-up", before: "pass", now: "pass" }]],
    ["checkResults", [{ name: 1, result: "pass-pass", before: "pass", now: "pass" }]],
  ])("rejects invalid %s", (key, value) => { expect(isLogEntry({ ...entry(), [key as string]: value })).toBe(false); });
  it("requires all public fields instead of coercing missing values", () => {
    for (const key of Object.keys(entry())) {
      const value: Record<string, unknown> = { ...entry() };
      delete value[key];
      expect(isLogEntry(value), key).toBe(false);
    }
  });
  it("requires finite nonnegative safe-integer file counts", () => {
    for (const key of ["added", "modified", "deleted", "unchanged"]) {
      for (const value of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, "0", null]) {
        expect(isLogEntry({ ...entry(), fileSummary: { ...entry().fileSummary, [key]: value } })).toBe(false);
      }
    }
  });
  it("accepts every defined check result and state without inventing a comparison", () => {
    for (const result of ["pass-pass", "pass-fail", "fail-fail", "fail-pass", "pass-timeout", "fail-timeout", "timeout-pass", "timeout-fail", "timeout-timeout", "config-removed", "config-added", "unverified", "definition-changed"]) {
      for (const state of ["pass", "fail", "timeout", "unverified"]) {
        expect(isLogEntry({ ...entry(), checkResults: [{ name: "test", result, before: state, now: state }] })).toBe(true);
      }
    }
  });
});
