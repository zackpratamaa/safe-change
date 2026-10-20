import { it, expect, vi } from "vitest";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
vi.mock("../../src/git/inspector.js", () => ({ getGitState: async () => ({ headCommit: "head", isClean: true }) }));
vi.mock("../../src/integrity/fingerprint.js", () => ({ captureWorkspaceFingerprint: async () => ({ digest: "fixture-fingerprint" }) }));
vi.mock("../../src/enforcement/policy-signature.js", () => ({ enforcementPolicyDigest: () => "fixture-policy" }));
vi.mock("../../src/sandbox/factory.js", () => ({ getSandboxProvider: () => ({ detectCapabilities: async () => ({ processIsolation: false, filesystemIsolation: false, readOnlyWorkspace: false, isolatedHome: false, environmentIsolation: false, networkIsolation: false, processTreeTermination: true, cpuLimit: false, memoryLimit: false, fileDescriptorLimit: false, outputLimit: true, symlinkProtection: false }) }) }));
import { createReplayManifest } from "../../src/replay/recorder.js";
it("records the actual tool package version rather than the inspected application's version", async () => {
  const root = await mkdtemp(join(tmpdir(), "sc-replay-version-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "inspected-app", version: "999.0.0-fixture" }));
    const tool = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
    const m = await createReplayManifest(root, { version: 1, checks: [] }, "fixture", "fixture", "head", [], []);
    expect(m.safeChangeVersion).toBe(tool.version);
    expect(m.safeChangeVersion).not.toBe("999.0.0-fixture");
    expect(m.sandboxCapabilities?.processTreeTermination).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
