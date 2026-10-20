import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { collectDoctorReport, runDoctor } from "../../src/commands/doctor.js";
import { runSave } from "../../src/commands/save.js";
import { setCustomSandboxProvider } from "../../src/sandbox/factory.js";
import type { SandboxCapabilities } from "../../src/sandbox/types.js";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";

function provider(networkIsolation = true, detectionError = false) {
  const capabilities: SandboxCapabilities = {
    processIsolation: true, filesystemIsolation: true, readOnlyWorkspace: true,
    isolatedHome: true, environmentIsolation: true, networkIsolation,
    processTreeTermination: true, cpuLimit: false, memoryLimit: false,
    fileDescriptorLimit: false, outputLimit: true, symlinkProtection: true,
  };
  setCustomSandboxProvider({
    id: "doctor-fixture", name: "Doctor test fixture", platform: process.platform,
    detectCapabilities: async () => { if (detectionError) throw new Error("unavailable"); return capabilities; },
    evaluatePolicy: async () => ({ providerId: "doctor-fixture", providerName: "Doctor test fixture", platform: process.platform, state: "DEGRADED", enforcedCapabilities: [], unavailableCapabilities: [], degradedCapabilities: [], reasons: [] }),
    prepareEnvironment: () => ({}),
    prepareCommand: (_spec, executable, args) => ({ executable, args }),
  });
}

describe("local readiness doctor", () => {
  let repo: TempRepo;
  let cwd: string;
  let output: string;
  beforeEach(async () => {
    cwd = process.cwd(); repo = await createTempRepo(); process.chdir(repo.path);
    await repo.writeFile(".gitignore", ".safe-change/\n");
    output = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += chunk.toString(); return true; });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    provider();
  });
  afterEach(async () => { process.chdir(cwd); vi.restoreAllMocks(); setCustomSandboxProvider(null); await repo.cleanup(); });

  it("reports missing configuration and baseline without creating them", async () => {
    const before = await repo.git("status", "--porcelain");
    const report = await collectDoctorReport();
    expect(report.scope).toBe("local-readiness");
    expect(report.checks.find(item => item.id === "configuration")?.status).toBe("warn");
    expect(report.checks.find(item => item.id === "baseline")?.status).toBe("warn");
    expect(existsSync(join(repo.path, ".safe-change.json"))).toBe(false);
    expect(existsSync(join(repo.path, ".safe-change"))).toBe(false);
    expect((await repo.git("status", "--porcelain")).stdout).toBe(before.stdout);
  });
  it("inspects executable metadata but never executes a configured project check or exposes arguments", async () => {
    await repo.createConfig([{ name: "side-effect", executable: process.execPath, args: ["-e", "require('fs').writeFileSync('DO_NOT_CREATE','sensitive-value')"] }]);
    const report = await collectDoctorReport();
    expect(report.checks.find(item => item.id === "executable:1")?.status).toBe("pass");
    expect(existsSync(join(repo.path, "DO_NOT_CREATE"))).toBe(false);
    expect(JSON.stringify(report)).not.toContain("sensitive-value");
  });
  it("returns a blocking structured report for an unavailable configured executable", async () => {
    await repo.createConfig([{ name: "missing", executable: "definitely-missing-safe-change-tool", args: [] }]);
    expect(await runDoctor({ format: "json" })).toBe(1);
    expect(JSON.parse(output).status).toBe("blocked");
    expect(JSON.parse(output).checks.find((item: {id: string}) => item.id === "executable:1").status).toBe("error");
  });
  it("reports invalid configuration without echoing its contents", async () => {
    await repo.writeFile(".safe-change.json", "invalid-sensitive-fixture");
    const report = await collectDoctorReport();
    expect(report.checks.find(item => item.id === "configuration")?.status).toBe("error");
    expect(JSON.stringify(report)).not.toContain("invalid-sensitive-fixture");
  });
  it("warns when a valid configuration has no real verification checks", async () => {
    await repo.createConfig([]);
    const report = await collectDoctorReport();
    expect(report.checks.find(item => item.id === "configuration")?.status).toBe("warn");
  });
  it("reads an existing baseline without claiming verification freshness", async () => {
    await repo.createConfig([{ name: "fixture", executable: process.execPath, args: ["-e", "process.exit(0)"] }]);
    expect(await runSave({ description: "doctor fixture", format: "json" })).toBe(0);
    const report = await collectDoctorReport();
    expect(report.checks.find(item => item.id === "baseline")?.status).toBe("pass");
    expect(report.checks.find(item => item.id === "baseline")?.message).toContain("freshness was not verified");
  });
  it("fails on corrupt baseline or state accidentally tracked in Git", async () => {
    await repo.writeFile(".safe-change/baseline.json", "not-json");
    await repo.git("add", "--force", ".safe-change/baseline.json");
    const report = await collectDoctorReport();
    expect(report.checks.find(item => item.id === "baseline")?.status).toBe("error");
    expect(report.checks.find(item => item.id === "state-ignore")?.status).toBe("error");
  });
  it("warns rather than silently claiming isolation on restricted hosts", async () => {
    provider(false);
    const report = await collectDoctorReport();
    expect(report.checks.find(item => item.id === "sandbox-network")?.status).toBe("warn");
    expect(await runDoctor()).toBe(0);
    expect(output).toContain("Local readiness only");
  });
  it("handles a failed capability probe honestly", async () => {
    provider(false, true);
    expect((await collectDoctorReport()).checks.find(item => item.id === "sandbox-network")?.status).toBe("warn");
  });
  it("can diagnose setup before entering a Git repository", async () => {
    const report = await collectDoctorReport(join(repo.path, ".."));
    expect(report.checks.find(item => item.id === "repository")?.status).toBe("warn");
  });
  it("keeps configured mandatory network denial blocking on an incapable host", async () => {
    await repo.writeFile(".safe-change.json", JSON.stringify({
      version: 1, checks: [], enforcementPolicy: {
        policyVersion: 1, defaultDecision: "deny", requireSignedPolicy: false, agents: [],
        commandSandbox: { allowedExecutables: [], deniedArguments: [], allowedEnvironment: [], inheritEnvironment: false, networkPolicy: "deny", maxOutputBytes: 4096 },
        approvals: { thresholds: {}, prohibitSelfApproval: true, maximumExceptionTtlSeconds: 600 },
      },
    }));
    provider(false);
    const report = await collectDoctorReport();
    expect(report.checks.find(item => item.id === "configuration")?.status).toBe("warn");
    expect(report.checks.find(item => item.id === "sandbox-network")?.status).toBe("error");
    expect(report.status).toBe("blocked");
  });
});
