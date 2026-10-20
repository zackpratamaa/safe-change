import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
// @ts-expect-error release-internal JavaScript helper is exercised as-is.
import { components, validateReleaseEvidence } from "../../scripts/release-evidence.mjs";
const sha = "a".repeat(40), baselineId = `sha256:${"b".repeat(64)}`;
const hash = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
function fixture(change: (data: any) => void = () => undefined) {
  const data: Record<string, any> = {
    "baseline-summary.json": { headCommit: sha },
    "diff-summary.json": { added: [], modified: [], deleted: [] },
    "environment-fingerprint.json": { digest: "fixture" },
    "verification-report.json": { schemaVersion: 1, state: "verified", exitCode: 0, verificationBinding: { baselineDigest: baselineId }, checks: [
      { name: "build", result: "pass-pass", exitCode: 0, timedOut: false, outputBlocked: false, detectedSecretTypes: [] },
      { name: "test", result: "pass-pass", exitCode: 0, timedOut: false, outputBlocked: false, detectedSecretTypes: [] },
    ] },
    "manifest.json": { schemaVersion: 1, sessionId: `release-${sha}`, baselineId, verificationState: "verified", verificationFreshness: "fresh", files: components },
  };
  change(data);
  const files = Object.fromEntries(Object.entries(data).map(([name, value]) => [name, JSON.stringify(value)]));
  data["manifest.json"].evidenceDigest = `sha256:${hash(JSON.stringify(Object.fromEntries(components.map((name: string) => [name, `sha256:${hash(files[name])}`]))))}`;
  files["manifest.json"] = JSON.stringify(data["manifest.json"]);
  files["checksums.txt"] = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => `${hash(bytes)}  ${name}`).join("\n") + "\n";
  return files;
}
describe("release evidence packaging gate", () => {
  it("accepts only matching fresh bound configured pass-pass evidence", () => { expect(validateReleaseEvidence(fixture(), sha, ["build", "test"]).verificationState).toBe("verified"); });
  it.each([
    ["stale", (d: any) => { d["manifest.json"].verificationFreshness = "stale"; }],
    ["unverified", (d: any) => { d["verification-report.json"].state = "not-verified"; }],
    ["different commit", (d: any) => { d["baseline-summary.json"].headCommit = "c".repeat(40); }],
    ["different baseline", (d: any) => { d["verification-report.json"].verificationBinding.baselineDigest = "wrong"; }],
    ["failed", (d: any) => { d["verification-report.json"].checks[0].result = "pass-fail"; }],
    ["bad exit", (d: any) => { d["verification-report.json"].checks[0].exitCode = 1; }],
    ["timeout", (d: any) => { d["verification-report.json"].checks[0].timedOut = true; }],
    ["blocked output", (d: any) => { d["verification-report.json"].checks[0].outputBlocked = true; }],
    ["secret", (d: any) => { d["verification-report.json"].checks[0].detectedSecretTypes = ["fixture"]; }],
    ["missing", (d: any) => { d["verification-report.json"].checks.pop(); }],
    ["duplicate", (d: any) => { d["verification-report.json"].checks[1].name = "build"; }],
    ["changed source", (d: any) => { d["diff-summary.json"].modified.push("src/index.ts"); }],
  ])("rejects rechecksummed %s evidence", (_label, change) => { expect(() => validateReleaseEvidence(fixture(change as any), sha, ["build", "test"])).toThrow(); });
  it("rejects changed component bytes", () => { const files = fixture(); files["baseline-summary.json"] += " "; expect(() => validateReleaseEvidence(files, sha, ["build", "test"])).toThrow(/Checksum/); });
  it("rejects unexpected files rather than packing private material", () => { const files = fixture(); files["private.pem"] = "fixture"; expect(() => validateReleaseEvidence(files, sha, ["build", "test"])).toThrow(/file set/); });
  it("rejects traversal checksum names", () => { const files = fixture(); files["checksums.txt"] = files["checksums.txt"].replace("manifest.json", "../manifest.json"); expect(() => validateReleaseEvidence(files, sha, ["build", "test"])).toThrow(); });
  it("does not equate empty or duplicated requirements with verification", () => { for (const required of [[], ["build", "build"]]) expect(() => validateReleaseEvidence(fixture(), sha, required)).toThrow(); });
  it("wires actual CLI dogfooding and both release attachment paths without new publishing permission", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8"), release = readFileSync(".github/workflows/release.yml", "utf8");
    expect(ci).toContain("node scripts/release-evidence.mjs"); expect(ci).toContain("release-evidence-bundle");
    expect(release).toContain("node scripts/release-evidence.mjs");
    expect(release.match(/--generate-notes .*release-evidence\.tar\.gz release-evidence\.tar\.gz\.sha256/g)).toHaveLength(2);
    expect(release).toContain("if-no-files-found: error");
    expect(release.split("if: github.event_name == 'push' && github.ref_type == 'tag' && startsWith(github.ref_name, 'v')")).toHaveLength(3);
  });
});
