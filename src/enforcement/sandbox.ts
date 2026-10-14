import { basename } from "node:path";
import type {
  CheckDefinition,
  CommandSandboxPolicy,
} from "../types/index.js";

export interface SandboxDecision {
  readonly allowed: boolean;
  readonly reasons: readonly string[];
  readonly environment: NodeJS.ProcessEnv;
}

export function evaluateCommandSandbox(
  check: CheckDefinition,
  policy: CommandSandboxPolicy,
  sourceEnvironment: NodeJS.ProcessEnv = process.env,
  options?: {
    readonly osProviderHandlesNetworkDeny?: boolean;
  }
): SandboxDecision {
  const reasons: string[] = [];
  const executableName = basename(check.executable).toLowerCase();
  const allowedExecutables = new Set(
    policy.allowedExecutables.map((value) => value.toLowerCase())
  );
  if (
    !allowedExecutables.has(check.executable.toLowerCase()) &&
    !allowedExecutables.has(executableName)
  ) {
    reasons.push(`Executable "${check.executable}" is not allowlisted.`);
  }
  const deniedArguments = new Set(policy.deniedArguments);
  for (const argument of check.args) {
    if (deniedArguments.has(argument)) {
      reasons.push(`Argument "${argument}" is denied by command policy.`);
    }
  }
  if (policy.networkPolicy === "deny" && !options?.osProviderHandlesNetworkDeny) {
    reasons.push(
      "Network denial was requested but no mandatory OS isolation provider is configured."
    );
  }

  const environment: NodeJS.ProcessEnv = {};
  if (policy.inheritEnvironment) {
    for (const [name, value] of Object.entries(sourceEnvironment)) {
      environment[name] = value;
    }
  } else {
    for (const name of policy.allowedEnvironment) {
      const value = sourceEnvironment[name];
      if (value !== undefined) environment[name] = value;
    }
  }

  return { allowed: reasons.length === 0, reasons, environment };
}