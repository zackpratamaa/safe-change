import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxProvider } from "../provider.js";
import type {
  SandboxCapabilities,
  SandboxCapabilityReport,
  SandboxExecutionSpec,
} from "../types.js";

const execFileAsync = promisify(execFile);
type CapabilityProbe = (
  executable: string, args: string[], options: { timeout: number; maxBuffer: number },
) => Promise<unknown>;

export class LinuxSandboxProvider implements SandboxProvider {
  readonly id = "linux-sandbox";
  readonly name = "Linux Container/Namespace Sandbox";
  readonly platform: NodeJS.Platform = "linux";
  private capabilityProbe: Promise<SandboxCapabilities> | null = null;

  constructor(private readonly probe: CapabilityProbe = execFileAsync) {}

  detectCapabilities(): Promise<SandboxCapabilities> {
    // Share in-flight detection as well as its result across concurrent checks.
    this.capabilityProbe ??= this.probeCapabilities();
    return this.capabilityProbe;
  }

  private async probeCapabilities(): Promise<SandboxCapabilities> {
    let filesystemIsolation = false;
    let networkIsolation = false;
    let home: string | undefined;
    try {
      home = await mkdtemp(join(tmpdir(), "safe-change-probe-"));
      const spec: SandboxExecutionSpec = {
        executable: process.execPath, args: ["--eval", "process.exit(0)"],
        cwd: process.cwd(), timeoutSeconds: 5, maxOutputBytes: 4096,
        allowedEnv: [], inheritEnv: false, networkPolicy: "inherit",
        readOnlyWorkspace: true,
      };
      // Installation is not proof of usable kernel/AppArmor permissions.
      // Exercise the same mount and PID namespace layout as real execution.
      const filesystem = this.prepareCommand(spec, spec.executable, spec.args, home);
      await this.probe(filesystem.executable, [...filesystem.args], { timeout: 5000, maxBuffer: 4096 });
      filesystemIsolation = true;
      const network = this.prepareCommand({ ...spec, networkPolicy: "deny" }, spec.executable, spec.args, home);
      await this.probe(network.executable, [...network.args], { timeout: 5000, maxBuffer: 4096 });
      networkIsolation = true;
    } catch {
      // Missing binary, denied namespace, timeout or failed layout: fail closed.
    } finally {
      if (home) await rm(home, { recursive: true, force: true });
    }
    return {
      processIsolation: true,
      filesystemIsolation,
      readOnlyWorkspace: filesystemIsolation,
      isolatedHome: true,
      environmentIsolation: true,
      networkIsolation,
      processTreeTermination: true,
      cpuLimit: false,
      memoryLimit: false,
      fileDescriptorLimit: false,
      outputLimit: true,
      symlinkProtection: true,
    };
  }

  async evaluatePolicy(spec: SandboxExecutionSpec): Promise<SandboxCapabilityReport> {
    const caps = await this.detectCapabilities();
    const enforced: (keyof SandboxCapabilities)[] = [];
    const unavailable: (keyof SandboxCapabilities)[] = [];
    const degraded: (keyof SandboxCapabilities)[] = [];
    const reasons: string[] = [];
    for (const [k, v] of Object.entries(caps)) {
      const key = k as keyof SandboxCapabilities;
      if (v) enforced.push(key);
      else unavailable.push(key);
    }
    let isBlocked = false;
    if (spec.networkPolicy === "deny" && !caps.networkIsolation) {
      isBlocked = true;
      reasons.push("Network deny requested but bubblewrap (bwrap) network namespace isolation is unavailable on this Linux host (runtime probe failed; check kernel and AppArmor permissions)");
    }
    if (spec.readOnlyWorkspace && !caps.readOnlyWorkspace) {
      isBlocked = true;
      reasons.push("Read-only workspace requested but filesystem isolation is unavailable");
    }
    const state = isBlocked ? "BLOCKED" : unavailable.length > 0 ? "DEGRADED" : "ENFORCED";
    return {
      providerId: this.id, providerName: this.name, platform: this.platform,
      state, enforcedCapabilities: enforced, unavailableCapabilities: unavailable,
      degradedCapabilities: degraded, reasons,
    };
  }

  prepareEnvironment(spec: SandboxExecutionSpec, tempHome: string): Record<string, string> {
    const env: Record<string, string> = {};
    if (spec.inheritEnv) {
      for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined) env[k] = v;
      }
    }
    for (const key of spec.allowedEnv) {
      const val = process.env[key];
      if (val !== undefined) env[key] = val;
    }
    env["HOME"] = tempHome;
    env["USER"] = "sandbox-user";
    env["TMPDIR"] = tempHome;
    return env;
  }

  prepareCommand(
    spec: SandboxExecutionSpec, executable: string, args: readonly string[], tempHome: string,
  ): { readonly executable: string; readonly args: readonly string[] } {
    if (spec.networkPolicy !== "deny" && !spec.readOnlyWorkspace) {
      return { executable, args };
    }
    const bwrapArgs: string[] = [
      "--die-with-parent", "--new-session", "--unshare-pid",
      "--ro-bind", "/", "/", "--proc", "/proc", "--dev", "/dev",
      "--tmpfs", "/tmp",
      // Bind the private writable home back after mounting the private /tmp.
      "--bind", tempHome, tempHome,
      "--setenv", "HOME", tempHome,
      // Re-bind even read-only workspaces: a repository may itself be under /tmp.
      spec.readOnlyWorkspace ? "--ro-bind" : "--bind", spec.cwd, spec.cwd,
      "--chdir", spec.cwd,
    ];
    if (spec.networkPolicy === "deny") bwrapArgs.push("--unshare-net");
    bwrapArgs.push("--", executable, ...args);
    return { executable: "bwrap", args: bwrapArgs };
  }
}
