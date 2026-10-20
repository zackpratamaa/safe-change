import { readFile, writeFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

export const components = ["baseline-summary.json", "diff-summary.json", "environment-fingerprint.json", "verification-report.json"];
export const bundleFiles = [...components, "manifest.json", "checksums.txt"];
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
export function validateReleaseEvidence(files, sourceSha, requiredChecks) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha) || !requiredChecks.length || new Set(requiredChecks).size !== requiredChecks.length) throw new Error("Invalid source or required check set");
  if (Object.keys(files).sort().join() !== [...bundleFiles].sort().join()) throw new Error("Unexpected evidence file set");
  const expected = [...components, "manifest.json"].sort();
  const lines = files["checksums.txt"].toString().trim().split("\n");
  const entries = lines.map(line => /^([a-f0-9]{64})  ([a-z-]+\.json)$/.exec(line));
  if (entries.some(entry => !entry) || entries.map(entry => entry[2]).sort().join() !== expected.join()) throw new Error("Invalid checksum file set");
  for (const [, hash, name] of entries) if (digest(files[name]) !== hash) throw new Error(`Checksum mismatch: ${name}`);
  const json = name => JSON.parse(files[name].toString());
  const manifest = json("manifest.json"), verification = json("verification-report.json"), baseline = json("baseline-summary.json"), diff = json("diff-summary.json");
  const componentDigests = Object.fromEntries(components.map(name => [name, `sha256:${digest(files[name])}`]));
  if (manifest.schemaVersion !== 1 || manifest.files?.join() !== components.join() ||
      manifest.evidenceDigest !== `sha256:${digest(JSON.stringify(componentDigests))}` ||
      manifest.sessionId !== `release-${sourceSha}` || manifest.verificationFreshness !== "fresh" || manifest.verificationState !== "verified") throw new Error("Evidence manifest is not fresh verified source-bound evidence");
  if (baseline.headCommit !== sourceSha || verification.schemaVersion !== 1 || verification.state !== "verified" || verification.exitCode !== 0 ||
      !/^sha256:[a-f0-9]{64}$/.test(manifest.baselineId) || verification.verificationBinding?.baselineDigest !== manifest.baselineId) throw new Error("Source or baseline binding mismatch");
  const checks = verification.checks;
  if (!Array.isArray(checks) || checks.length !== requiredChecks.length || new Set(checks.map(check => check.name)).size !== checks.length ||
      requiredChecks.some(name => !checks.some(check => check.name === name)) ||
      checks.some(check => check.result !== "pass-pass" || check.exitCode !== 0 || check.timedOut !== false || check.outputBlocked !== false || !Array.isArray(check.detectedSecretTypes) || check.detectedSecretTypes.length)) throw new Error("Every configured check must have an unblocked pass-pass result");
  if (![diff.added, diff.modified, diff.deleted].every(value => Array.isArray(value) && value.length === 0)) throw new Error("Release workspace changed since its baseline");
  return manifest;
}
function cli(args) {
  const result = spawnSync(process.execPath, ["dist/cli.js", ...args, "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let report; try { report = JSON.parse(result.stdout ?? ""); } catch { /* no raw output in diagnostics */ }
  if (result.error || result.status !== 0) {
    console.error(JSON.stringify({ stage: args[0], exitCode: result.status, errorCode: result.error?.code,
      verification: report?.verification, checks: report?.results?.map(check => ({ name: check.name, result: check.result, exitCode: check.exitCode, timedOut: check.timedOut, outputBlocked: check.outputBlocked })) }));
    throw new Error(`Release self-check stage ${args[0]} failed; no verified archive produced`);
  }
  return report;
}
export async function generateReleaseEvidence(env = process.env) {
  const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (env.GITHUB_SHA !== sourceSha || !/^[a-f0-9]{40}$/.test(sourceSha) ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY ?? "") || !/^\d+$/.test(env.GITHUB_RUN_ID ?? "")) throw new Error("Missing or mismatched CI provenance");
  const configBytes = await readFile(".safe-change.json"), config = JSON.parse(configBytes);
  const session = `release-${sourceSha}`;
  cli(["save", `Release self-check ${sourceSha}`]);
  cli(["check", "--strict"]);
  cli(["evidence", session]);
  const files = Object.fromEntries(await Promise.all(bundleFiles.map(async name => [name, await readFile(join(".safe-change/evidence", session, name))])));
  const manifest = validateReleaseEvidence(files, sourceSha, config.checks.map(check => check.name));
  const output = resolve(env.RUNNER_TEMP ?? tmpdir());
  const staging = await mkdtemp(join(output, "sc-release-evidence-"));
  try {
    const directory = join(staging, "release-evidence"); await mkdir(directory);
    for (const [name, bytes] of Object.entries(files)) await writeFile(join(directory, name), bytes);
    const provenance = { schemaVersion: 1, sourceSha, runUrl: `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
      packageVersion: JSON.parse(await readFile("package.json", "utf8")).version,
      configurationSha256: digest(configBytes), requiredChecks: config.checks.map(check => check.name), evidenceDigest: manifest.evidenceDigest,
      scope: "Self-check of this workspace and configured commands, not independent review, all-platform certification or a signed attestation" };
    await writeFile(join(directory, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n");
    const archive = join(output, "release-evidence.tar.gz");
    execFileSync("tar", ["-czf", archive, "-C", staging, "release-evidence"]);
    await writeFile(`${archive}.sha256`, `${digest(await readFile(archive))}  release-evidence.tar.gz\n`);
    console.log(JSON.stringify({ archive, ...provenance }, null, 2));
    return provenance;
  } finally { await rm(staging, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateReleaseEvidence().catch(error => { console.error(error.message); process.exitCode = 1; });
}
