import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, symlink, link } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import type { ReplayManifest, ReplayDriftCategory } from "../../src/replay/types.js";

const fake = vi.hoisted(() => ({
  identity: vi.fn(), git: vi.fn(), fingerprint: vi.fn(), capabilities: vi.fn(), execute: vi.fn(), exec: vi.fn(),
}));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  return { execFile: Object.assign(() => undefined, { [promisify.custom]: fake.exec }) };
});
vi.mock("../../src/replay/recorder.js", () => ({
  repositoryIdentityDigest: fake.identity,
  normalizeReplayOutput: (text: string, root: string) => text.replaceAll("\\", "/").replaceAll(root.replaceAll("\\", "/"), "<REPO_ROOT>"),
}));
vi.mock("../../src/git/inspector.js", () => ({ getGitState: fake.git }));
vi.mock("../../src/integrity/fingerprint.js", () => ({ captureWorkspaceFingerprint: fake.fingerprint }));
vi.mock("../../src/enforcement/policy-signature.js", () => ({ enforcementPolicyDigest: () => "policy" }));
vi.mock("../../src/runner/executor.js", () => ({ executeCheck: fake.execute }));
vi.mock("../../src/sandbox/factory.js", () => ({ getSandboxProvider: () => ({ detectCapabilities: fake.capabilities }) }));
import { verifyReplayManifest } from "../../src/replay/runner.js";
import { hashReplayArtifact } from "../../src/replay/artifacts.js";
import { stableStringify } from "../../src/integrity/hash.js";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const caps = {
  processIsolation: true, filesystemIsolation: true, readOnlyWorkspace: true,
  isolatedHome: true, environmentIsolation: true, networkIsolation: true,
  processTreeTermination: true, cpuLimit: true, memoryLimit: true,
  fileDescriptorLimit: true, outputLimit: true, symlinkProtection: true,
};
const config = { version: 1 as const, checks: [{ name: "test", executable: "node", args: ["--version"], timeout: 10 }] };
function seal(manifest: ReplayManifest): ReplayManifest {
  const { manifestDigest: _, ...unsigned } = manifest;
  return { ...unsigned, manifestDigest: hash(stableStringify(unsigned)) };
}
function baseline(): ReplayManifest {
  return seal({ schemaVersion: 1, sessionId: "fixture", repositoryHash: "repo", startingCommit: "head", endingCommit: "head", workspaceWasClean: true,
    baselineId: "head", policyDigest: "", workspaceFingerprint: "fp", lockfileHashes: {}, safeChangeVersion: "fixture-only",
    agentProfile: "fixture", operatingSystem: process.platform, architecture: process.arch, runtimeVersions: { node: process.version },
    sandboxCapabilities: caps, normalizedCommands: [{ name: "test", executable: "node", args: ["--version"], approvedEnvKeys: ["NODE_ENV", "PATH"], workingDirectory: ".", order: 1, timeoutSeconds: 10, maxOutputBytes: 100 * 1024 }],
    recordedResults: [{ name: "test", exitCode: 0, signal: null, stdoutDigest: hash(""), stderrDigest: hash(""), secretRedactionState: { outputBlocked: false, detectedSecretTypes: [] }, artifactHashes: {}, durationMs: 10 }],
    createdAt: "2026-01-01T00:00:00.000Z", manifestDigest: "" });
}
let root: string;
beforeEach(async () => {
  vi.resetAllMocks();
  root = await mkdtemp(join(tmpdir(), "sc-replay-corpus-"));
  fake.identity.mockResolvedValue("repo"); fake.git.mockResolvedValue({ headCommit: "head", isClean: true });
  fake.fingerprint.mockResolvedValue({ digest: "fp" }); fake.capabilities.mockResolvedValue(caps);
  fake.exec.mockResolvedValue({ stdout: "", stderr: "" });
  fake.execute.mockImplementation(async (command: { name: string }) => ({ ...command, exitCode: 0, stdout: "", stderr: "", durationMs: 10, outputBlocked: false, detectedSecretTypes: [] }));
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

// Each case isolates one category. Except the digest-corruption case, manifests
// are rehashed after mutation so a generic checksum error cannot satisfy a case.
const fixtures: { category: ReplayDriftCategory; reexecute?: boolean; alter: (m: ReplayManifest) => ReplayManifest | Promise<ReplayManifest> }[] = [
  { category: "REPOSITORY_DRIFT", alter: m => ({ ...m, repositoryHash: "other" }) },
  { category: "COMMIT_DRIFT", alter: m => ({ ...m, endingCommit: "other" }) },
  { category: "CONFIGURATION_DRIFT", alter: m => ({ ...m, workspaceFingerprint: "other" }) },
  { category: "POLICY_DRIFT", alter: m => ({ ...m, policyDigest: "other" }) },
  { category: "DEPENDENCY_DRIFT", alter: async m => { await writeFile(join(root, "package-lock.json"), "changed"); return { ...m, lockfileHashes: { "package-lock.json": hash("original") } }; } },
  { category: "ENVIRONMENT_DRIFT", alter: m => ({ ...m, operatingSystem: "fixture-other-os" }) },
  { category: "COMMAND_DRIFT", alter: m => ({ ...m, normalizedCommands: [] }) },
  { category: "OUTPUT_DRIFT", reexecute: true, alter: m => { fake.execute.mockResolvedValue({ name: "test", exitCode: 0, stdout: "changed", stderr: "", durationMs: 10, outputBlocked: false }); return m; } },
  { category: "EXIT_STATUS_DRIFT", reexecute: true, alter: m => { fake.execute.mockResolvedValue({ name: "test", exitCode: 1, stdout: "", stderr: "", durationMs: 10, outputBlocked: false }); return m; } },
  { category: "ARTIFACT_DRIFT", alter: async m => { await writeFile(join(root, "report.txt"), "changed"); return { ...m, recordedResults: [{ ...m.recordedResults[0]!, artifactHashes: { "report.txt": hash("original") } }] }; } },
  { category: "SECRET_REDACTION_DRIFT", reexecute: true, alter: m => { fake.execute.mockResolvedValue({ name: "test", exitCode: 0, stdout: "", stderr: "", durationMs: 10, outputBlocked: false, detectedSecretTypes: ["fixture-secret-type"] }); return m; } },
  { category: "SANDBOX_CAPABILITY_DRIFT", alter: m => ({ ...m, sandboxCapabilities: { ...caps, networkIsolation: false } }) },
  { category: "NON_DETERMINISTIC_RESULT", alter: m => ({ ...m, manifestDigest: "corrupt" }) },
];
describe("13 distinct replay drift fixtures", () => {
  it.each(fixtures)("isolates $category without relying on an unrelated digest mismatch", async fixture => {
    const changed = await fixture.alter(baseline());
    const manifest = fixture.category === "NON_DETERMINISTIC_RESULT" ? changed : seal(changed);
    const report = await verifyReplayManifest(root, config, manifest, { reexecute: fixture.reexecute });
    expect(report.verified).toBe(false);
    expect([...new Set(report.mismatches.map(m => m.category))]).toEqual([fixture.category]);
  });
  it("has exactly one fixture for every declared category", () => {
    expect(new Set(fixtures.map(f => f.category)).size).toBe(13);
    expect(fixtures).toHaveLength(13);
  });
  it("accepts matching metadata without claiming commands were re-executed", async () => {
    const report = await verifyReplayManifest(root, config, baseline());
    expect(report.verified).toBe(true); expect(report.replayedResults).toEqual([]); expect(fake.execute).not.toHaveBeenCalled();
  });
  it("accepts matching re-execution observations", async () => {
    const report = await verifyReplayManifest(root, config, baseline(), { reexecute: true });
    expect(report.mismatches).toEqual([]); expect(report.replayedResults).toHaveLength(1); expect(fake.execute).toHaveBeenCalledTimes(1);
  });
  it("never executes commands from a preflight-mismatched manifest", async () => {
    const manifest = seal({ ...baseline(), repositoryHash: "other" });
    await verifyReplayManifest(root, config, manifest, { reexecute: true });
    expect(fake.exec).not.toHaveBeenCalled(); expect(fake.execute).not.toHaveBeenCalled();
  });
  it("does not bless legacy manifests missing capability observations", async () => {
    const { sandboxCapabilities: _, ...legacy } = baseline();
    const report = await verifyReplayManifest(root, config, seal(legacy), { reexecute: true });
    expect(report.mismatches.map(m => m.category)).toEqual(["SANDBOX_CAPABILITY_DRIFT"]); expect(fake.execute).not.toHaveBeenCalled();
  });
  it("does not bless unavailable capability detection", async () => {
    fake.capabilities.mockRejectedValue(new Error("fixture unavailable"));
    const report = await verifyReplayManifest(root, config, baseline());
    expect(report.mismatches.map(m => m.category)).toEqual(["SANDBOX_CAPABILITY_DRIFT"]);
  });
  it("propagates a dependency install failure instead of running checks with a broken install", async () => {
    fake.exec.mockImplementation(async (_exe: string, args: string[]) => {
      if (args[0] === "worktree" && args[1] === "add") await writeFile(join(args[3]!, "package-lock.json"), "fixture-lock");
      if (args[0] === "ci") throw new Error("fixture npm install failed");
      return { stdout: "", stderr: "" };
    });
    await expect(verifyReplayManifest(root, config, baseline(), { reexecute: true })).rejects.toThrow("fixture npm install failed");
    expect(fake.execute).not.toHaveBeenCalled();
  });
  it("detects a declared artifact missing from replay worktree", async () => {
    await writeFile(join(root, "report.txt"), "original");
    const m = baseline();
    const manifest = seal({ ...m, recordedResults: [{ ...m.recordedResults[0]!, artifactHashes: { "report.txt": hash("original") } }] });
    const report = await verifyReplayManifest(root, config, manifest, { reexecute: true });
    expect(report.mismatches.map(m => m.category)).toEqual(["ARTIFACT_DRIFT"]);
  });
});
describe("workspace-relative artifact observations", () => {
  it("hashes an unchanged regular file and detects changed content", async () => {
    await mkdir(join(root, "out")); await writeFile(join(root, "out/report"), "original");
    expect(await hashReplayArtifact(root, "out/report")).toBe(hash("original"));
    await writeFile(join(root, "out/report"), "changed");
    expect(await hashReplayArtifact(root, "out/report")).toBe(hash("changed"));
  });
  it.each(["../outside", "/etc/passwd", "C:\\outside", "a/../outside", "a//b", "./file", "a\0b", ""])("rejects unsafe path %j", async path => { expect(await hashReplayArtifact(root, path)).toBeNull(); });
  it("rejects symlinked directory ancestors", async () => {
    const outside = await mkdtemp(join(tmpdir(), "sc-outside-"));
    try { await writeFile(join(outside, "report"), "outside"); await symlink(outside, join(root, "alias"), process.platform === "win32" ? "junction" : "dir"); expect(await hashReplayArtifact(root, "alias/report")).toBeNull(); }
    finally { await rm(outside, { recursive: true, force: true }); }
  });
  it("rejects hardlinked artifact files", async () => {
    await writeFile(join(root, "original"), "content"); await link(join(root, "original"), join(root, "alias"));
    expect(await hashReplayArtifact(root, "alias")).toBeNull();
  });
});
