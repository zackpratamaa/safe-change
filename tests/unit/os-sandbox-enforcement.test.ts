import { describe, it, expect, afterEach } from "vitest";
import {
  getSandboxProvider,
  setCustomSandboxProvider,
  evaluateSandbox,
} from "../../src/sandbox/factory.js";
import type { SandboxProvider } from "../../src/sandbox/provider.js";
import type {
  SandboxCapabilities,
  SandboxCapabilityReport,
  SandboxExecutionSpec,
} from "../../src/sandbox/types.js";
import { resolveSafeCommand } from "../../src/sandbox/resolver.js";
import { executeCheck } from "../../src/runner/executor.js";
import type { CommandSandboxPolicy } from "../../src/types/index.js";

describe("OS-Backed Sandbox & Enforcement", () => {
  it("detects sandbox capabilities for current operating system honestly", async () => {
    const provider = getSandboxProvider();
    const caps = await provider.detectCapabilities();

    expect(caps.processIsolation).toBe(true);
    expect(caps.processTreeTermination).toBe(true);
    expect(caps.outputLimit).toBe(true);

    // On Windows and macOS without bubblewrap/containers, networkIsolation is honestly false
    if (process.platform === "win32" || process.platform === "darwin") {
      expect(caps.networkIsolation).toBe(false);
      expect(caps.readOnlyWorkspace).toBe(false);
    }
  });

  it("fails closed (BLOCKED) when policy requires network denial on platform without OS network isolation", async () => {
    const report = await evaluateSandbox({
      executable: "node",
      args: ["--version"],
      cwd: process.cwd(),
      timeoutSeconds: 10,
      maxOutputBytes: 10000,
      allowedEnv: ["NODE_ENV"],
      inheritEnv: false,
      networkPolicy: "deny",
      readOnlyWorkspace: false,
    });

    if (process.platform === "win32" || process.platform === "darwin") {
      expect(report.state).toBe("BLOCKED");
      expect(report.reasons.some((r) => r.includes("network"))).toBe(true);
    }
  });

  it("fails closed (BLOCKED) when policy requires read-only workspace without OS filesystem isolation", async () => {
    const report = await evaluateSandbox({
      executable: "node",
      args: ["--version"],
      cwd: process.cwd(),
      timeoutSeconds: 10,
      maxOutputBytes: 10000,
      allowedEnv: ["NODE_ENV"],
      inheritEnv: false,
      networkPolicy: "inherit",
      readOnlyWorkspace: true,
    });

    if (process.platform === "win32" || process.platform === "darwin") {
      expect(report.state).toBe("BLOCKED");
      expect(report.reasons.some((r) => r.includes("Read-only workspace"))).toBe(
        true
      );
    }
  });

  it("resolves node/npm safe command directly without invoking cmd.exe or shell", () => {
    const res = resolveSafeCommand("npm", ["--version"], process.cwd());
    expect(res.executable).not.toContain("cmd.exe");
    expect(res.executable).not.toContain("powershell");
  });

  it("rejects forbidden control characters in executable path", () => {
    expect(() =>
      resolveSafeCommand("node\0malicious", ["-v"], process.cwd())
    ).toThrow();
    expect(() =>
      resolveSafeCommand("node\nmalicious", ["-v"], process.cwd())
    ).toThrow();
  });

  it("enforces output limit on large command outputs", async () => {
    const res = await executeCheck(
      {
        name: "output-test",
        executable: process.execPath,
        args: ["-e", "for(let i=0;i<1000;i++) console.log('line ' + i)"],
        timeout: 10,
      },
      {
        cwd: process.cwd(),
        outputLimit: 500, // strict 500 byte limit
      }
    );

    expect(res.passed).toBe(true);
    expect(res.outputTruncated).toBe(true);
  });

  afterEach(() => {
    setCustomSandboxProvider(null);
  });

  it("terminates child process tree upon timeout", async () => {
    const res = await executeCheck(
      {
        name: "sleep-test",
        executable: process.execPath,
        args: [
          "-e",
          "setTimeout(() => console.log('done'), 10000);",
        ],
        timeout: 1, // 1 second timeout
      },
      {
        cwd: process.cwd(),
      }
    );

    expect(res.timedOut).toBe(true);
    expect(res.passed).toBe(false);
  });

  it("blocks network-deny when provider detectCapabilities throws an error (fail closed)", async () => {
    const throwingProvider: SandboxProvider = {
      id: "throwing-provider",
      name: "Throwing Provider",
      platform: process.platform,
      detectCapabilities: async () => {
        throw new Error("Kernel capability detection crashed");
      },
      evaluatePolicy: async () => ({ state: "SUPPORTED", reasons: [] }),
      prepareEnvironment: () => ({}),
      prepareCommand: (_s, executable, args) => ({ executable, args }),
    };
    setCustomSandboxProvider(throwingProvider);

    const res = await executeCheck(
      {
        name: "network-deny-test",
        executable: process.execPath,
        args: ["--version"],
        timeout: 5,
      },
      {
        cwd: process.cwd(),
        sandboxPolicy: {
          allowedExecutables: [process.execPath],
          deniedArguments: [],
          allowedEnvironment: [],
          inheritEnvironment: false,
          networkPolicy: "deny",
          maxOutputBytes: 1024,
        },
      }
    );

    expect(res.passed).toBe(false);
    expect(res.exitCode).toBeNull();
    expect(res.stderr).toContain("no mandatory OS isolation provider is configured");
  });

  it("blocks network-deny when provider reports networkIsolation false", async () => {
    const nonIsolatedProvider: SandboxProvider = {
      id: "non-isolated-provider",
      name: "Non Isolated Provider",
      platform: process.platform,
      detectCapabilities: async () => ({
        processIsolation: true,
        processTreeTermination: true,
        outputLimit: true,
        environmentFilter: true,
        networkIsolation: false,
        readOnlyWorkspace: false,
      }),
      evaluatePolicy: async () => ({ state: "SUPPORTED", reasons: [] }),
      prepareEnvironment: () => ({}),
      prepareCommand: (_s, executable, args) => ({ executable, args }),
    };
    setCustomSandboxProvider(nonIsolatedProvider);

    const res = await executeCheck(
      {
        name: "network-deny-test",
        executable: process.execPath,
        args: ["--version"],
        timeout: 5,
      },
      {
        cwd: process.cwd(),
        sandboxPolicy: {
          allowedExecutables: [process.execPath],
          deniedArguments: [],
          allowedEnvironment: [],
          inheritEnvironment: false,
          networkPolicy: "deny",
          maxOutputBytes: 1024,
        },
      }
    );

    expect(res.passed).toBe(false);
    expect(res.exitCode).toBeNull();
    expect(res.stderr).toContain("no mandatory OS isolation provider is configured");
  });

  it("forwards network-deny to provider when network isolation is supported", async () => {
    let receivedSpec: SandboxExecutionSpec | null = null;
    const isolatedProvider: SandboxProvider = {
      id: "mock-bwrap-provider",
      name: "Mock Bubblewrap Provider",
      platform: process.platform,
      detectCapabilities: async () => ({
        processIsolation: true,
        processTreeTermination: true,
        outputLimit: true,
        environmentFilter: true,
        networkIsolation: true,
        readOnlyWorkspace: true,
      }),
      evaluatePolicy: async (spec) => {
        receivedSpec = spec;
        return { state: "SUPPORTED", reasons: [] };
      },
      prepareEnvironment: () => ({ ...process.env }),
      prepareCommand: (_s, executable, args) => ({ executable, args }),
    };
    setCustomSandboxProvider(isolatedProvider);

    const res = await executeCheck(
      {
        name: "network-deny-allowed",
        executable: process.execPath,
        args: ["-e", "process.stdout.write('isolated-pass')"],
        timeout: 5,
      },
      {
        cwd: process.cwd(),
        sandboxPolicy: {
          allowedExecutables: [process.execPath],
          deniedArguments: [],
          allowedEnvironment: ["PATH"],
          inheritEnvironment: true,
          networkPolicy: "deny",
          maxOutputBytes: 1024,
        },
      }
    );

    expect(res.passed).toBe(true);
    expect(res.stdout).toBe("isolated-pass");
    expect(receivedSpec).not.toBeNull();
    expect(receivedSpec?.networkPolicy).toBe("deny");
  });

  it("fails closed when provider evaluatePolicy returns BLOCKED", async () => {
    const blockingProvider: SandboxProvider = {
      id: "blocking-provider",
      name: "Blocking Provider",
      platform: process.platform,
      detectCapabilities: async () => ({
        processIsolation: true,
        processTreeTermination: true,
        outputLimit: true,
        environmentFilter: true,
        networkIsolation: true,
        readOnlyWorkspace: true,
      }),
      evaluatePolicy: async () => ({
        state: "BLOCKED",
        reasons: ["Mandatory network namespace unshare denied by kernel"],
      }),
      prepareEnvironment: () => ({}),
      prepareCommand: (_s, executable, args) => ({ executable, args }),
    };
    setCustomSandboxProvider(blockingProvider);

    const res = await executeCheck(
      {
        name: "blocked-check",
        executable: process.execPath,
        args: ["--version"],
        timeout: 5,
      },
      {
        cwd: process.cwd(),
        sandboxPolicy: {
          allowedExecutables: [process.execPath],
          deniedArguments: [],
          allowedEnvironment: [],
          inheritEnvironment: false,
          networkPolicy: "deny",
          maxOutputBytes: 1024,
        },
      }
    );

    expect(res.passed).toBe(false);
    expect(res.exitCode).toBeNull();
    expect(res.stderr).toContain("Command blocked by OS sandbox: Mandatory network namespace unshare denied by kernel");
  });

  it("fails closed without unisolated fallback when provider prepareCommand fails", async () => {
    const failingStartupProvider: SandboxProvider = {
      id: "failing-startup",
      name: "Failing Startup Provider",
      platform: process.platform,
      detectCapabilities: async () => ({
        processIsolation: true,
        processTreeTermination: true,
        outputLimit: true,
        environmentFilter: true,
        networkIsolation: true,
        readOnlyWorkspace: true,
      }),
      evaluatePolicy: async () => ({ state: "SUPPORTED", reasons: [] }),
      prepareEnvironment: () => ({}),
      prepareCommand: () => {
        throw new Error("Failed to initialize sandbox rootfs mount point");
      },
    };
    setCustomSandboxProvider(failingStartupProvider);

    const res = await executeCheck(
      {
        name: "startup-failure",
        executable: process.execPath,
        args: ["-e", "process.stdout.write('MUST_NOT_EXECUTE')"],
        timeout: 5,
      },
      {
        cwd: process.cwd(),
        sandboxPolicy: {
          allowedExecutables: [process.execPath],
          deniedArguments: [],
          allowedEnvironment: [],
          inheritEnvironment: false,
          networkPolicy: "deny",
          maxOutputBytes: 1024,
        },
      }
    );

    expect(res.passed).toBe(false);
    expect(res.exitCode).toBeNull();
    expect(res.stdout).toBe("");
    expect(res.stderr).toContain("Spawn error: Failed to initialize sandbox rootfs mount point");
  });

  it("verifies live bubblewrap OS sandbox when bwrap is available on Linux", async () => {
    if (process.platform !== "linux") return;
    const provider = getSandboxProvider();
    const caps = await provider.detectCapabilities();
    if (!caps.networkIsolation) return;

    const res = await executeCheck(
      {
        name: "live-bwrap-check",
        executable: process.execPath,
        args: ["-e", "process.stdout.write('live-bwrap-ok')"],
        timeout: 10,
      },
      {
        cwd: process.cwd(),
        sandboxPolicy: {
          allowedExecutables: [process.execPath],
          deniedArguments: [],
          allowedEnvironment: ["PATH"],
          inheritEnvironment: false,
          networkPolicy: "deny",
          maxOutputBytes: 4096,
        },
      }
    );

    expect(res.passed).toBe(true);
    expect(res.stdout).toBe("live-bwrap-ok");
  });
});
