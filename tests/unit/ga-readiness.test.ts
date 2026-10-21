import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  REQUIRED_REVIEW_SCOPES,
  validateGaReadiness,
} from "../../scripts/validate-ga-readiness.mjs";

const sourceSha = "a".repeat(40);
const now = new Date("2026-02-01T00:00:00.000Z");
const ready = () => ({
  schemaVersion: 1,
  status: "ready",
  candidateSha: sourceSha,
  stabilization: {
    minimumDays: 14,
    startedOn: "2026-01-01",
    endedOn: "2026-01-20",
    testedRuns: [
      { sourceSha, url: "https://github.com/example/repo/actions/runs/1" },
    ],
    incidents: [],
  },
  independentSecurityReview: {
    status: "completed",
    provider: "Independent Security Lab",
    reportUrl: "https://security.example/report",
    auditedSha: "b".repeat(40),
    retestSha: sourceSha,
    scopes: [...REQUIRED_REVIEW_SCOPES],
    openCriticalFindings: 0,
    openHighFindings: 0,
  },
  releaseApproval: {
    approved: true,
    decisionUrl: "https://github.com/example/repo/issues/1",
    approvers: ["release-owner"],
  },
});

const validate = (record: any) =>
  validateGaReadiness(record, { sourceSha, now });

describe("GA readiness gate", () => {
  it("accepts a complete source-bound stabilization, review, and approval record", () => {
    expect(validate(ready())).toEqual({ valid: true, errors: [] });
  });

  it.each([
    ["blocked status", (record: any) => (record.status = "blocked")],
    [
      "different candidate",
      (record: any) => (record.candidateSha = "c".repeat(40)),
    ],
    [
      "unapproved minimum",
      (record: any) => (record.stabilization.minimumDays = null),
    ],
    [
      "short stabilization",
      (record: any) => (record.stabilization.endedOn = "2026-01-05"),
    ],
    [
      "future stabilization",
      (record: any) => (record.stabilization.endedOn = "2026-03-01"),
    ],
    [
      "different run SHA",
      (record: any) =>
        (record.stabilization.testedRuns[0].sourceSha = "d".repeat(40)),
    ],
    [
      "unresolved incident",
      (record: any) =>
        record.stabilization.incidents.push({
          status: "open",
          url: "https://issues.example/1",
        }),
    ],
    [
      "incomplete review",
      (record: any) => (record.independentSecurityReview.status = "draft"),
    ],
    [
      "missing review scope",
      (record: any) => record.independentSecurityReview.scopes.pop(),
    ],
    [
      "open high finding",
      (record: any) => (record.independentSecurityReview.openHighFindings = 1),
    ],
    [
      "missing approval",
      (record: any) => (record.releaseApproval.approved = false),
    ],
  ])("rejects %s", (_label, mutate) => {
    const record = ready();
    mutate(record);
    expect(validate(record).valid).toBe(false);
  });

  it("keeps the checked-in record blocked until real evidence exists", () => {
    const record = JSON.parse(readFileSync("docs/ga-readiness.json", "utf8"));
    expect(record.status).toBe("blocked");
    expect(validate(record).valid).toBe(false);
  });

  it("runs only for stable tag pushes and cannot be marked non-blocking", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");
    expect(workflow).toContain("node scripts/validate-ga-readiness.mjs");
    expect(workflow).toContain(
      "if: github.event_name == 'push' && github.ref_type == 'tag' && !contains(github.ref_name, '-')",
    );
    expect(workflow).not.toContain("continue-on-error");
  });
});
