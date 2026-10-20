import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const metrics = ["lines", "statements", "functions", "branches"];
export function validateSummary(summary) {
  for (const key of metrics) {
    const value = summary?.total?.[key];
    if (!value || !Number.isSafeInteger(value.total) || value.total <= 0 ||
        !Number.isSafeInteger(value.covered) || value.covered < 0 || value.covered > value.total ||
        !Number.isFinite(value.pct) || value.pct < 0 || value.pct > 100 ||
        Math.abs(value.pct - (value.covered / value.total * 100)) > 0.011) {
      throw new Error(`Invalid measured coverage for ${key}`);
    }
  }
  return summary.total;
}
export function validateContext(env) {
  if (env.GITHUB_EVENT_NAME !== "push" || env.GITHUB_REF !== "refs/heads/main") throw new Error("Coverage publication is restricted to main push events");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY ?? "") ||
      !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "") || !/^\d+$/.test(env.GITHUB_RUN_ID ?? "")) throw new Error("Invalid coverage provenance");
  return { repository: env.GITHUB_REPOSITORY, sourceSha: env.GITHUB_SHA,
    runUrl: `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` };
}
export function coverageFiles(summary, context, configText, latest) {
  const total = validateSummary(summary);
  const report = { schemaVersion: 1, ...context, command: "npm run test:coverage", platform: "ubuntu-latest",
    scope: "V8 source coverage using the committed vitest.config.ts include/exclude rules; not all repository code or a security assurance score",
    configUrl: `https://github.com/${context.repository}/blob/${context.sourceSha}/vitest.config.ts`,
    configSha256: createHash("sha256").update(configText).digest("hex"), total };
  const label = `${total.lines.pct.toFixed(2)}%`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="176" height="20" role="img" aria-label="V8 source lines: ${label}"><rect width="176" height="20" fill="#38424e"/><text x="8" y="14" fill="white" font-family="Verdana,sans-serif" font-size="11">V8 source lines</text><text x="118" y="14" fill="white" font-family="Verdana,sans-serif" font-size="11">${label}</text></svg>\n`;
  const files = { "coverage-report.json": JSON.stringify(report, null, 2) + "\n", "coverage.svg": svg,
    "vitest.config.ts.txt": configText };
  return Object.entries(files).flatMap(([name, content]) => [
    { path: `reports/${context.sourceSha}/${name}`, content },
    ...(latest ? [{ path: name, content }] : []),
  ]);
}
export async function publishCoverage({ env = process.env, summary, configText, fetchImpl = fetch }) {
  const context = validateContext(env);
  validateSummary(summary);
  if (!env.GITHUB_TOKEN) throw new Error("Missing publication token");
  const base = `https://api.github.com/repos/${context.repository}`;
  async function api(path, method = "GET", body, allowMissing = false) {
    const response = await fetchImpl(base + path, { method, headers: {
      Accept: "application/vnd.github+json", Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json",
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new Error(`Coverage publication ${method} ${path} failed (HTTP ${response.status})`);
    return response.json();
  }
  const main = await api("/git/ref/heads/main");
  const existing = await api("/git/ref/heads/coverage-reports", "GET", undefined, true);
  const commit = existing ? await api(`/git/commits/${existing.object.sha}`) : null;
  // Serial publication and a non-force ref update preserve existing SHA-scoped
  // reports. A superseded main run may add its report, but cannot replace latest.
  const latest = main.object.sha === context.sourceSha;
  const tree = await api("/git/trees", "POST", {
    ...(commit ? { base_tree: commit.tree.sha } : {}),
    tree: coverageFiles(summary, context, configText, latest).map(file => ({ ...file, mode: "100644", type: "blob" })),
  });
  const next = await api("/git/commits", "POST", { message: `coverage: measured source lines for ${context.sourceSha}`,
    tree: tree.sha, parents: existing ? [existing.object.sha] : [] });
  if (existing) await api("/git/refs/heads/coverage-reports", "PATCH", { sha: next.sha, force: false });
  else await api("/git/refs", "POST", { ref: "refs/heads/coverage-reports", sha: next.sha });
  return { ...context, latest, reportUrl: `https://github.com/${context.repository}/blob/coverage-reports/reports/${context.sourceSha}/coverage-report.json` };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await publishCoverage({ summary: JSON.parse(await readFile("coverage/coverage-summary.json", "utf8")),
    configText: await readFile("vitest.config.ts", "utf8") });
  console.log(JSON.stringify(result, null, 2));
}
