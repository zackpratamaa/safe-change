import { access, lstat } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { OutputFormat, SafeChangeConfig } from "../types/index.js";
import { getRepositoryRoot } from "../git/inspector.js";
import { isStateIgnored, hasTrackedState } from "../git/state-ignore.js";
import { loadConfig } from "../config/loader.js";
import { loadBaseline } from "../baseline/manager.js";
import { getSandboxProvider } from "../sandbox/factory.js";
import { resolveSafeCommand } from "../sandbox/resolver.js";

export interface DoctorCheck {
  readonly id: string;
  readonly status: "pass" | "warn" | "error";
  readonly message: string;
  readonly action?: string;
}

export interface DoctorReport {
  readonly schemaVersion: 1;
  readonly scope: "local-readiness";
  readonly status: "ready" | "needs-attention" | "blocked";
  readonly checks: readonly DoctorCheck[];
  readonly limitations: readonly string[];
}

/** Inspect command metadata only. Never launch a configured project executable. */
async function inspectExecutable(executable: string, cwd: string): Promise<boolean> {
  try {
    const resolved = resolveSafeCommand(executable, [], cwd).executable;
    if (!isAbsolute(resolved)) return false;
    if (process.platform === "win32" && /\.(cmd|bat|ps1)$/i.test(resolved)) return false;
    const info = await lstat(resolved);
    if (!info.isFile() && !info.isSymbolicLink()) return false;
    await access(resolved, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function collectDoctorReport(cwd: string = process.cwd()): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const major = Number(process.versions.node.split(".")[0]);
  checks.push({
    id: "node", status: major < 18 ? "error" : major < 22 || major % 2 !== 0 ? "warn" : "pass",
    message: `Node.js ${process.versions.node}`,
    action: major < 22 || major % 2 !== 0 ? "Use a supported even-numbered Node.js LTS release; Node.js 22 and 24 are recommended." : undefined,
  });
  const gitAvailable = await inspectExecutable("git", cwd);
  checks.push({ id: "git", status: gitAvailable ? "pass" : "error", message: gitAvailable ? "Git executable is available." : "Git executable is unavailable.", action: gitAvailable ? undefined : "Install Git and make its native executable available on PATH." });

  let repoRoot: string | null = null;
  if (gitAvailable) {
    try { repoRoot = await getRepositoryRoot(cwd); } catch { /* May be run before entering a repository. */ }
  }
  checks.push({ id: "repository", status: repoRoot ? "pass" : "warn", message: repoRoot ? "Current directory belongs to a Git repository." : "No Git repository was detected.", action: repoRoot ? undefined : "Enter the project repository before running init, save or check." });

  let config: SafeChangeConfig | null = null;
  if (repoRoot) {
    const configPath = join(repoRoot, ".safe-change.json");
    if (!existsSync(configPath)) {
      checks.push({ id: "configuration", status: "warn", message: "No safe-change configuration is present.", action: "Run safe-change init, then review the generated checks." });
    } else {
      try {
        const info = await lstat(configPath);
        if (!info.isFile() || info.isSymbolicLink()) throw new Error("Not a regular configuration file");
        config = await loadConfig(repoRoot);
        checks.push({ id: "configuration", status: config.checks.length > 0 ? "pass" : "warn", message: config.checks.length > 0 ? "Configuration is valid and contains verification checks." : "Configuration contains no verification checks.", action: config.checks.length > 0 ? undefined : "Add a real build or test check; file tracking alone does not verify behavior." });
      } catch {
        checks.push({ id: "configuration", status: "error", message: "Configuration could not be safely loaded or is invalid.", action: "Review .safe-change.json using the documented schema. No configuration was changed." });
      }
    }
    if (config) {
      for (const [index, check] of config.checks.entries()) {
        const available = await inspectExecutable(check.executable, repoRoot);
        checks.push({ id: `executable:${index + 1}`, status: available ? "pass" : "error", message: available ? `Executable for check ${index + 1} is available (not executed).` : `Executable for check ${index + 1} cannot be launched directly.`, action: available ? undefined : "Install the required tool or configure a native executable/interpreter. Windows batch files are not direct-spawn executables." });
      }
    }
    try {
      const baseline = await loadBaseline(repoRoot);
      checks.push({ id: "baseline", status: baseline ? "pass" : "warn", message: baseline ? "A readable baseline is present; freshness was not verified." : "No baseline is present.", action: baseline ? undefined : "After reviewing configuration, run safe-change save before making changes." });
    } catch {
      checks.push({ id: "baseline", status: "error", message: "The existing baseline is invalid or unreadable.", action: "Inspect the baseline and preserve needed evidence before explicitly replacing it." });
    }
    try {
      const tracked = await hasTrackedState(repoRoot);
      const ignored = await isStateIgnored(repoRoot);
      checks.push({ id: "state-ignore", status: tracked ? "error" : ignored ? "pass" : "warn", message: tracked ? "Private .safe-change state is already tracked by Git." : ignored ? "Git ignore rules exclude the core state files." : "Core .safe-change state files are not fully excluded by Git.", action: tracked ? "Review tracked state and its history; adding an ignore rule does not untrack committed files." : ignored ? undefined : "Add .safe-change/ to the project .gitignore or explicitly run init --update-gitignore." });
    } catch {
      checks.push({ id: "state-ignore", status: "warn", message: "Git state-file exclusion could not be confirmed.", action: "Review Git ignore rules and tracked state manually." });
    }
  }
  const requiresNetworkIsolation = config?.enforcementPolicy?.commandSandbox.networkPolicy === "deny";
  try {
    const capabilities = await getSandboxProvider().detectCapabilities();
    checks.push({ id: "sandbox-network", status: capabilities.networkIsolation ? "pass" : requiresNetworkIsolation ? "error" : "warn", message: capabilities.networkIsolation ? "The sandbox provider reports network isolation available." : "OS-backed network isolation is unavailable on this host.", action: capabilities.networkIsolation ? undefined : requiresNetworkIsolation ? "Use a supported isolation-capable host. Required network-deny checks remain blocked." : "Do not treat ordinary command execution as network-isolated; use a supported provider if isolation is required." });
  } catch {
    checks.push({ id: "sandbox-network", status: requiresNetworkIsolation ? "error" : "warn", message: "Sandbox capabilities could not be determined.", action: "Inspect the host sandbox setup before relying on isolation." });
  }
  return {
    schemaVersion: 1, scope: "local-readiness",
    status: checks.some(item => item.status === "error") ? "blocked" : checks.some(item => item.status === "warn") ? "needs-attention" : "ready",
    checks,
    limitations: [
      "Project checks were not executed and existing verification freshness was not established.",
      "No dependencies were installed, repository files changed, or baseline created by doctor.",
      "Executable presence is not proof of a working toolchain, full JDK, secure application or production certification.",
      "Host sandbox detection may run bounded platform probes using temporary directories outside the repository.",
    ],
  };
}

export async function runDoctor(options: { readonly format?: OutputFormat } = {}): Promise<number> {
  const report = await collectDoctorReport();
  if (options.format === "json") {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(`safe-change doctor: ${report.status}\n\n`);
    for (const item of report.checks) {
      process.stdout.write(`[${item.status.toUpperCase()}] ${item.id}: ${item.message}\n`);
      if (item.action) process.stdout.write(`  Next: ${item.action}\n`);
    }
    process.stdout.write("\nLocal readiness only. Run safe-change check --strict for actual verification.\n");
  }
  return report.status === "blocked" ? 1 : 0;
}
