import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  SafeChangeConfig,
  CheckDefinition,
  ChangeBudget,
  EnterpriseMode,
  EnterprisePolicy,
  EnforcementPolicy,
  PolicySignature,
} from "../types/index.js";
import {
  DEFAULT_CHANGE_BUDGET,
  DEFAULT_ENTERPRISE_POLICY,
  ENTERPRISE_MODES,
} from "../enterprise/policy.js";
import {
  validateEnforcementPolicy,
  validatePolicySignature,
} from "../enforcement/config.js";
import { verifyPolicySignature } from "../enforcement/policy-signature.js";

const CONFIG_FILENAME = ".safe-change.json";
const DEFAULT_TIMEOUT = 60;
const MAX_TIMEOUT = 3600;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export async function loadConfig(projectRoot: string): Promise<SafeChangeConfig> {
  const configPath = join(projectRoot, CONFIG_FILENAME);
  let raw: string;

  try {
    raw = await readFile(configPath, "utf-8");
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      throw new ConfigError(
        `Configuration file not found: ${configPath}\n` +
        `Create a ${CONFIG_FILENAME} file with your verification checks.\n` +
        `Example:\n` +
        `{\n` +
        `  "version": 1,\n` +
        `  "checks": [\n` +
        `    { "name": "build", "executable": "npm", "args": ["run", "build"], "timeout": 60 }\n` +
        `  ]\n` +
        `}`
      );
    }
    throw new ConfigError(`Failed to read configuration: ${String(err)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError(
      `Invalid JSON in ${configPath}. Check for syntax errors.`
    );
  }

  return validateConfig(parsed);
}

function validateConfig(data: unknown): SafeChangeConfig {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ConfigError("Configuration must be a JSON object.");
  }

  const obj = data as Record<string, unknown>;

  if (obj["version"] !== 1) {
    throw new ConfigError(
      `Unsupported configuration version: ${String(obj["version"])}. Expected version 1.`
    );
  }

  if (!Array.isArray(obj["checks"])) {
    throw new ConfigError(`"checks" must be an array.`);
  }

  const checks: CheckDefinition[] = [];
  const names = new Set<string>();

  for (let i = 0; i < obj["checks"].length; i++) {
    const check = validateCheckDefinition(obj["checks"][i], i);
    if (names.has(check.name)) {
      throw new ConfigError(
        `Duplicate check name "${check.name}" at index ${i}.`
      );
    }
    names.add(check.name);
    checks.push(check);
  }

  let protectedVerificationPaths: string[] | undefined;
  if (obj["protectedVerificationPaths"] !== undefined) {
    const paths = obj["protectedVerificationPaths"];
    if (!Array.isArray(paths) || paths.some(path =>
      typeof path !== "string" || !path.trim() || path.startsWith("/") ||
      path.includes("\\") || path.split("/").includes("..") || /^[A-Za-z]:/.test(path)
    )) {
      throw new ConfigError("protectedVerificationPaths must be repository-relative glob strings without parent traversal.");
    }
    protectedVerificationPaths = paths as string[];
  }

  let logRetention: number | undefined;
  if (obj["logRetention"] !== undefined) {
    if (
      typeof obj["logRetention"] !== "number" ||
      obj["logRetention"] <= 0 ||
      !Number.isInteger(obj["logRetention"])
    ) {
      throw new ConfigError(`"logRetention" must be a positive integer.`);
    }
    logRetention = obj["logRetention"];
  }

  let dashboardPort: number | undefined;
  if (obj["dashboardPort"] !== undefined) {
    if (
      typeof obj["dashboardPort"] !== "number" ||
      obj["dashboardPort"] <= 0 ||
      obj["dashboardPort"] > 65535 ||
      !Number.isInteger(obj["dashboardPort"])
    ) {
      throw new ConfigError(
        `"dashboardPort" must be a valid port number (1-65535).`
      );
    }
    dashboardPort = obj["dashboardPort"];
  }

  let enforcementPolicy: EnforcementPolicy | undefined;
  let policySignature: PolicySignature | undefined;
  try {
    if (obj["enforcementPolicy"] !== undefined) {
      enforcementPolicy = validateEnforcementPolicy(obj["enforcementPolicy"]);
    }
    if (obj["policySignature"] !== undefined) {
      policySignature = validatePolicySignature(obj["policySignature"]);
    }
  } catch (error: unknown) {
    throw new ConfigError(
      error instanceof Error ? error.message : String(error)
    );
  }
  if (enforcementPolicy?.requireSignedPolicy) {
    const verification = verifyPolicySignature(
      enforcementPolicy,
      policySignature
    );
    if (!verification.valid) {
      throw new ConfigError(
        `Signed enforcement policy required: ${verification.reason}`
      );
    }
  }

  return {
    version: 1,
    checks,
    ...(protectedVerificationPaths ? { protectedVerificationPaths } : {}),
    ...(logRetention !== undefined ? { logRetention } : {}),
    ...(dashboardPort !== undefined ? { dashboardPort } : {}),
    ...(obj["enterprisePolicy"] !== undefined
      ? { enterprisePolicy: validateEnterprisePolicy(obj["enterprisePolicy"]) }
      : {}),
    ...(enforcementPolicy ? { enforcementPolicy } : {}),
    ...(policySignature ? { policySignature } : {}),
  };
}

function validateEnterprisePolicy(data: unknown): EnterprisePolicy {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ConfigError(`"enterprisePolicy" must be an object.`);
  }
  const obj = data as Record<string, unknown>;
  if (obj["policyVersion"] !== 1) {
    throw new ConfigError(`enterprisePolicy.policyVersion must be 1.`);
  }

  const booleanField = <K extends keyof EnterprisePolicy>(
    key: K,
    fallback: EnterprisePolicy[K]
  ): EnterprisePolicy[K] => {
    const value = obj[key];
    if (value === undefined) return fallback;
    if (typeof value !== "boolean") {
      throw new ConfigError(`enterprisePolicy.${String(key)} must be a boolean.`);
    }
    return value as EnterprisePolicy[K];
  };

  const minimumMode =
    obj["minimumMode"] ?? DEFAULT_ENTERPRISE_POLICY.minimumMode;
  if (
    typeof minimumMode !== "string" ||
    !ENTERPRISE_MODES.includes(minimumMode as EnterpriseMode)
  ) {
    throw new ConfigError(
      `enterprisePolicy.minimumMode must be one of: ${ENTERPRISE_MODES.join(", ")}.`
    );
  }

  const allowForcePush = booleanField("allowForcePush", false);
  const allowDestructiveGit = booleanField("allowDestructiveGit", false);
  if (allowForcePush !== false || allowDestructiveGit !== false) {
    throw new ConfigError(
      "Enterprise policy cannot enable force push or destructive Git operations."
    );
  }

  return {
    policyVersion: 1,
    minimumMode: minimumMode as EnterpriseMode,
    requireBaseline: booleanField("requireBaseline", true),
    requireTests: booleanField("requireTests", true),
    requireCoverage: booleanField("requireCoverage", false),
    requireDependencyAudit: booleanField("requireDependencyAudit", false),
    requireDiffReview: booleanField("requireDiffReview", true),
    allowForcePush: false,
    allowDestructiveGit: false,
    changeBudget: validateChangeBudget(obj["changeBudget"]),
  };
}

function validateChangeBudget(data: unknown): ChangeBudget {
  if (data === undefined) return DEFAULT_CHANGE_BUDGET;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ConfigError(`enterprisePolicy.changeBudget must be an object.`);
  }
  const obj = data as Record<string, unknown>;
  const integer = (key: keyof ChangeBudget, fallback: number): number => {
    const value = obj[key];
    if (value === undefined) return fallback;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new ConfigError(
        `enterprisePolicy.changeBudget.${String(key)} must be a non-negative integer.`
      );
    }
    return value;
  };
  const allowLockfileChanges =
    obj["allowLockfileChanges"] ?? DEFAULT_CHANGE_BUDGET.allowLockfileChanges;
  if (typeof allowLockfileChanges !== "boolean") {
    throw new ConfigError(
      "enterprisePolicy.changeBudget.allowLockfileChanges must be a boolean."
    );
  }

  return {
    maxFilesChanged: integer(
      "maxFilesChanged",
      DEFAULT_CHANGE_BUDGET.maxFilesChanged
    ),
    maxLinesAdded: integer(
      "maxLinesAdded",
      DEFAULT_CHANGE_BUDGET.maxLinesAdded
    ),
    maxLinesDeleted: integer(
      "maxLinesDeleted",
      DEFAULT_CHANGE_BUDGET.maxLinesDeleted
    ),
    maxPublicApisChanged: integer(
      "maxPublicApisChanged",
      DEFAULT_CHANGE_BUDGET.maxPublicApisChanged
    ),
    maxDeletedFiles: integer(
      "maxDeletedFiles",
      DEFAULT_CHANGE_BUDGET.maxDeletedFiles
    ),
    allowLockfileChanges,
  };
}

function validateCheckDefinition(data: unknown, index: number): CheckDefinition {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ConfigError(`checks[${index}] must be an object.`);
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj["name"] !== "string" || obj["name"].trim() === "") {
    throw new ConfigError(`checks[${index}].name must be a non-empty string.`);
  }

  if (typeof obj["executable"] !== "string" || obj["executable"].trim() === "") {
    throw new ConfigError(
      `checks[${index}].executable must be a non-empty string.`
    );
  }

  if (!Array.isArray(obj["args"])) {
    throw new ConfigError(`checks[${index}].args must be an array of strings.`);
  }

  for (let j = 0; j < obj["args"].length; j++) {
    if (typeof obj["args"][j] !== "string") {
      throw new ConfigError(
        `checks[${index}].args[${j}] must be a string.`
      );
    }
  }

  let timeout = DEFAULT_TIMEOUT;
  if (obj["timeout"] !== undefined) {
    if (typeof obj["timeout"] !== "number" || obj["timeout"] <= 0) {
      throw new ConfigError(
        `checks[${index}].timeout must be a positive number (seconds).`
      );
    }
    if (obj["timeout"] > MAX_TIMEOUT) {
      throw new ConfigError(
        `checks[${index}].timeout exceeds maximum of ${MAX_TIMEOUT} seconds.`
      );
    }
    timeout = obj["timeout"];
  }

  return {
    name: obj["name"].trim(),
    executable: obj["executable"].trim(),
    args: obj["args"] as string[],
    timeout,
  };
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
