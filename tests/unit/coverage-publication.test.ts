import { describe, it, expect, vi } from "vitest";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { validateSummary, coverageFiles, publishCoverage } = await import(pathToFileURL(resolve("scripts/publish-coverage.mjs")).href);
const sha = "a".repeat(40);
const env = { GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main", GITHUB_REPOSITORY: "owner/repo", GITHUB_SHA: sha, GITHUB_RUN_ID: "123", GITHUB_TOKEN: "fixture-only-token" };
const summary = () => ({ total: Object.fromEntries(["lines", "statements", "functions", "branches"].map(k => [k, { total: 100, covered: 89, skipped: 0, pct: 89 }])) });
const response = (data: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
function transport(existing = false, currentSha = sha) {
  return vi.fn(async (url: string, options: { method: string }) => {
    if (url.endsWith("/git/ref/heads/main")) return response({ object: { sha: currentSha } });
    if (url.endsWith("/git/ref/heads/coverage-reports")) return existing ? response({ object: { sha: "old" } }) : response({}, 404);
    if (url.endsWith("/git/commits/old")) return response({ tree: { sha: "old-tree" } });
    if (url.endsWith("/git/trees")) return response({ sha: "new-tree" });
    if (url.endsWith("/git/commits") && options.method === "POST") return response({ sha: "new-commit" });
    return response({});
  });
}
describe("public measured coverage publication", () => {
  it("renders the measured percentage and source/config/run provenance, not an invented number", () => {
    const context = { repository: "owner/repo", sourceSha: sha, runUrl: "https://github.com/owner/repo/actions/runs/123" };
    const files = coverageFiles(summary(), context, "config fixture", true);
    expect(files.find((f: { path: string }) => f.path === "coverage.svg").content).toContain("89.00%");
    const report = JSON.parse(files.find((f: { path: string }) => f.path === "coverage-report.json").content);
    expect(report.sourceSha).toBe(sha); expect(report.runUrl).toBe(context.runUrl); expect(report.total.lines.covered).toBe(89);
    expect(report.configSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each([null, {}, { total: {} }, { total: { lines: { total: 0, covered: 0, pct: 100 } } }])("rejects missing/empty measurements", value => { expect(() => validateSummary(value)).toThrow(); });
  it.each([NaN, Infinity, -1, 101, 99])("rejects invalid/inconsistent measured percentage %s", pct => { const s = summary(); s.total.lines.pct = pct; expect(() => validateSummary(s)).toThrow(); });
  it.each(["pull_request", "workflow_dispatch"])("does not give %s code a publication path", async event => {
    const fetchImpl = transport(); await expect(publishCoverage({ env: { ...env, GITHUB_EVENT_NAME: event }, summary: summary(), configText: "config", fetchImpl })).rejects.toThrow(); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("publishes only to a separate report branch with an atomic tree and non-force update", async () => {
    const fetchImpl = transport(true); const result = await publishCoverage({ env, summary: summary(), configText: "config", fetchImpl });
    expect(result.latest).toBe(true);
    const last = fetchImpl.mock.calls.at(-1)!; expect(last[0]).toContain("/git/refs/heads/coverage-reports");
    expect(JSON.parse((last[1] as unknown as { body: string }).body)).toEqual({ sha: "new-commit", force: false });
  });
  it("creates the report branch without copying source or workflow files", async () => {
    const fetchImpl = transport(); await publishCoverage({ env, summary: summary(), configText: "config", fetchImpl });
    const call = fetchImpl.mock.calls.find(c => c[0].endsWith("/git/trees"))!;
    const tree = JSON.parse((call[1] as unknown as { body: string }).body);
    expect(tree.base_tree).toBeUndefined(); expect(tree.tree.every((f: { path: string }) => !f.path.startsWith(".github/"))).toBe(true);
  });
  it("keeps superseded run reports commit-scoped without overwriting the latest badge", async () => {
    const fetchImpl = transport(true, "b".repeat(40)); const result = await publishCoverage({ env, summary: summary(), configText: "config", fetchImpl });
    expect(result.latest).toBe(false);
    const call = fetchImpl.mock.calls.find(c => c[0].endsWith("/git/trees"))!;
    expect(JSON.parse((call[1] as unknown as { body: string }).body).tree.every((f: { path: string }) => f.path.startsWith(`reports/${sha}/`))).toBe(true);
  });
  it("propagates a rejected report-branch write even after all reads and tree creation succeeded", async () => {
    const normal = transport(true);
    const fetchImpl = vi.fn(async (url: string, options: { method: string }) => {
      if (options.method === "PATCH") return response({}, 403);
      return normal(url, options);
    });
    await expect(publishCoverage({ env, summary: summary(), configText: "config", fetchImpl })).rejects.toThrow("HTTP 403");
    expect(fetchImpl.mock.calls.some(call => call[1].method === "PATCH")).toBe(true);
  });
  it("fails rather than claiming publication when API access is denied", async () => {
    const fetchImpl = vi.fn(async () => response({}, 403));
    await expect(publishCoverage({ env, summary: summary(), configText: "config", fetchImpl })).rejects.toThrow("HTTP 403");
  });
});
