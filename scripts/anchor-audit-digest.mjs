import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

function stableDigest(payload) {
  const json = JSON.stringify(payload, Object.keys(payload).sort());
  return `sha256:${createHash("sha256").update(json, "utf8").digest("hex")}`;
}

async function getGitCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

async function getGitRemote() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    return execSync("git config --get remote.origin.url", { encoding: "utf8" }).trim();
  } catch {
    return "local";
  }
}

async function main() {
  const repoRoot = process.cwd();
  const eventFilePath = join(repoRoot, ".safe-change", "events.jsonl");

  let events = [];
  try {
    const raw = await readFile(eventFilePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      if (line.trim()) {
        events.push(JSON.parse(line));
      }
    }
  } catch (err) {
    // If events file does not exist, events remain empty
  }

  // Verify hash chain
  let chainValid = true;
  let previousDigest = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.sequence !== i + 1 || e.previousDigest !== previousDigest) {
      chainValid = false;
      break;
    }
    const unsigned = {
      schemaVersion: e.schemaVersion,
      sequence: e.sequence,
      timestamp: e.timestamp,
      type: e.type,
      sessionId: e.sessionId,
      payloadDigest: e.payloadDigest,
      previousDigest: e.previousDigest,
    };
    const expectedDigest = stableDigest(unsigned);
    if (expectedDigest !== e.eventDigest) {
      chainValid = false;
      break;
    }
    previousDigest = e.eventDigest;
  }

  const latestEvent = events.at(-1);
  const latestEventDigest = latestEvent?.eventDigest ?? null;
  const commitSha = await getGitCommit();
  const repository = await getGitRemote();

  const anchor = {
    schemaVersion: 1,
    anchorType: "safe-change/audit-anchor/v1",
    anchoredAt: new Date().toISOString(),
    commitSha,
    repository,
    totalEvents: events.length,
    chainVerified: chainValid,
    latestEventDigest,
    firstEventDigest: events[0]?.eventDigest ?? null,
    latestSequence: latestEvent?.sequence ?? 0,
    latestTimestamp: latestEvent?.timestamp ?? null,
  };

  const anchorJson = JSON.stringify(anchor, null, 2);
  const anchorPath = join(repoRoot, "safe-change-audit-anchor.json");
  await writeFile(anchorPath, `${anchorJson}\n`, "utf8");
  console.log(`[audit-anchor] Wrote external audit anchor to ${anchorPath}:`);
  console.log(`  Events: ${anchor.totalEvents}, Verified: ${anchor.chainVerified}`);
  console.log(`  Latest Event Digest: ${anchor.latestEventDigest ?? "(none)"}`);

  // If in GitHub Actions and token is available, publish external commit status
  const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const ghRepo = process.env.GITHUB_REPOSITORY;
  const ghSha = process.env.GITHUB_SHA || (commitSha !== "unknown" ? commitSha : null);

  if (ghToken && ghRepo && ghSha) {
    console.log(`[audit-anchor] Publishing GitHub Commit Status for ${ghRepo}@${ghSha}...`);
    try {
      const description = latestEventDigest
        ? `Audit anchor: ${latestEventDigest.slice(0, 16)}... (${anchor.totalEvents} events)`
        : `Audit anchor: 0 events recorded (empty chain)`;

      const res = await fetch(`https://api.github.com/repos/${ghRepo}/statuses/${ghSha}`, {
        method: "POST",
        headers: {
          "Authorization": `token ${ghToken}`,
          "Accept": "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "safe-change-audit-anchor",
        },
        body: JSON.stringify({
          state: anchor.chainVerified ? "success" : "failure",
          description,
          context: "safe-change/audit-anchor",
          target_url: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
            ? `${process.env.GITHUB_SERVER_URL}/${ghRepo}/actions/runs/${process.env.GITHUB_RUN_ID}`
            : undefined,
        }),
      });

      if (!res.ok) {
        console.warn(`[audit-anchor] GitHub Status API returned HTTP ${res.status}: ${await res.text()}`);
      } else {
        console.log(`[audit-anchor] Successfully published GitHub Commit Status: ${description}`);
      }
    } catch (apiErr) {
      console.warn(`[audit-anchor] Could not publish commit status: ${apiErr}`);
    }
  } else {
    console.log("[audit-anchor] External GitHub API publishing skipped (not in GitHub Actions or GH_TOKEN unset).");
  }
}

main().catch((err) => {
  console.error("[audit-anchor] Error:", err);
  process.exit(1);
});
