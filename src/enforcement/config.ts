import type {
  AgentCapabilityPolicy,
  ApprovalPolicy,
  Capability,
  CommandSandboxPolicy,
  EnforcementPolicy,
  PolicySignature,
} from "../types/index.js";
import { isCapability } from "./decision.js";

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function strings(value: unknown, path: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`${path} must be an array of strings.`);
  }
  return value as string[];
}

function capabilities(value: unknown, path: string): Capability[] {
  const values = strings(value, path);
  for (const capability of values) {
    if (!isCapability(capability)) {
      throw new Error(`${path} contains unknown capability "${capability}".`);
    }
  }
  return values as Capability[];
}

function positiveInteger(
  value: unknown,
  path: string,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > maximum
  ) {
    throw new Error(`${path} must be an integer from 1 to ${maximum}.`);
  }
  return value;
}

function validateAgent(value: unknown, index: number): AgentCapabilityPolicy {
  const data = object(value, `enforcementPolicy.agents[${index}]`);
  if (
    typeof data["agent"] !== "string" ||
    !/^(?:\*|[a-z0-9][a-z0-9._-]{1,63})$/.test(data["agent"])
  ) {
    throw new Error(`enforcementPolicy.agents[${index}].agent is invalid.`);
  }
  const expiresAt = data["expiresAt"] ?? null;
  if (
    expiresAt !== null &&
    (typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt)))
  ) {
    throw new Error(
      `enforcementPolicy.agents[${index}].expiresAt must be an ISO timestamp or null.`,
    );
  }
  return {
    agent: data["agent"],
    allow: capabilities(
      data["allow"] ?? [],
      `enforcementPolicy.agents[${index}].allow`,
    ),
    deny: capabilities(
      data["deny"] ?? [],
      `enforcementPolicy.agents[${index}].deny`,
    ),
    resourcePatterns: strings(
      data["resourcePatterns"] ?? ["**"],
      `enforcementPolicy.agents[${index}].resourcePatterns`,
    ),
    expiresAt,
  };
}

function validateSandbox(value: unknown): CommandSandboxPolicy {
  const data = object(value ?? {}, "enforcementPolicy.commandSandbox");
  const networkPolicy = data["networkPolicy"] ?? "inherit";
  if (networkPolicy !== "inherit" && networkPolicy !== "deny") {
    throw new Error(
      "enforcementPolicy.commandSandbox.networkPolicy must be inherit or deny.",
    );
  }
  const inheritEnvironment = data["inheritEnvironment"] ?? false;
  if (typeof inheritEnvironment !== "boolean") {
    throw new Error(
      "enforcementPolicy.commandSandbox.inheritEnvironment must be a boolean.",
    );
  }
  return {
    allowedExecutables: strings(
      data["allowedExecutables"] ?? ["node", "npm", "npx"],
      "enforcementPolicy.commandSandbox.allowedExecutables",
    ),
    deniedArguments: strings(
      data["deniedArguments"] ?? ["--force", "--no-verify"],
      "enforcementPolicy.commandSandbox.deniedArguments",
    ),
    allowedEnvironment: strings(
      data["allowedEnvironment"] ?? [
        "PATH",
        "HOME",
        "TMPDIR",
        "TEMP",
        "SystemRoot",
        "CI",
      ],
      "enforcementPolicy.commandSandbox.allowedEnvironment",
    ),
    inheritEnvironment,
    networkPolicy,
    maxOutputBytes: positiveInteger(
      data["maxOutputBytes"],
      "enforcementPolicy.commandSandbox.maxOutputBytes",
      102_400,
      10_485_760,
    ),
  };
}

function validateApprovals(value: unknown): ApprovalPolicy {
  const data = object(value ?? {}, "enforcementPolicy.approvals");
  const rawThresholds = object(
    data["thresholds"] ?? {},
    "enforcementPolicy.approvals.thresholds",
  );
  const thresholds: Partial<Record<Capability, number>> = {};
  for (const [capability, threshold] of Object.entries(rawThresholds)) {
    if (!isCapability(capability)) {
      throw new Error(`Unknown approval capability "${capability}".`);
    }
    thresholds[capability] = positiveInteger(
      threshold,
      `enforcementPolicy.approvals.thresholds.${capability}`,
      1,
      10,
    );
  }
  const prohibitSelfApproval = data["prohibitSelfApproval"] ?? true;
  if (typeof prohibitSelfApproval !== "boolean") {
    throw new Error(
      "enforcementPolicy.approvals.prohibitSelfApproval must be a boolean.",
    );
  }
  const requireSignedApprovals = data["requireSignedApprovals"] ?? false;
  if (typeof requireSignedApprovals !== "boolean") {
    throw new Error(
      "enforcementPolicy.approvals.requireSignedApprovals must be a boolean.",
    );
  }
  return {
    thresholds,
    prohibitSelfApproval,
    requireSignedApprovals,
    maximumExceptionTtlSeconds: positiveInteger(
      data["maximumExceptionTtlSeconds"],
      "enforcementPolicy.approvals.maximumExceptionTtlSeconds",
      3600,
      604_800,
    ),
  };
}

export function validateEnforcementPolicy(value: unknown): EnforcementPolicy {
  const data = object(value, "enforcementPolicy");
  if (data["policyVersion"] !== 1) {
    throw new Error("enforcementPolicy.policyVersion must be 1.");
  }
  const defaultDecision = data["defaultDecision"] ?? "deny";
  if (defaultDecision !== "deny") {
    throw new Error(
      "enforcementPolicy.defaultDecision must be deny for fail-closed enforcement.",
    );
  }
  const requireSignedPolicy = data["requireSignedPolicy"] ?? false;
  if (typeof requireSignedPolicy !== "boolean") {
    throw new Error("enforcementPolicy.requireSignedPolicy must be a boolean.");
  }
  if (!Array.isArray(data["agents"])) {
    throw new Error("enforcementPolicy.agents must be an array.");
  }
  const agents = data["agents"].map(validateAgent);
  const names = new Set<string>();
  for (const agent of agents) {
    if (names.has(agent.agent)) {
      throw new Error(`Duplicate agent capability policy "${agent.agent}".`);
    }
    names.add(agent.agent);
    if (agent.allow.some((capability) => agent.deny.includes(capability))) {
      throw new Error(
        `Agent "${agent.agent}" cannot both allow and deny the same capability.`,
      );
    }
  }
  return {
    policyVersion: 1,
    defaultDecision,
    requireSignedPolicy,
    agents,
    commandSandbox: validateSandbox(data["commandSandbox"]),
    approvals: validateApprovals(data["approvals"]),
  };
}

export function validatePolicySignature(value: unknown): PolicySignature {
  const data = object(value, "policySignature");
  if (data["algorithm"] !== "ed25519") {
    throw new Error("policySignature.algorithm must be ed25519.");
  }
  for (const field of [
    "keyId",
    "publicKeyPem",
    "policyDigest",
    "signatureBase64",
  ] as const) {
    if (typeof data[field] !== "string" || data[field].length === 0) {
      throw new Error(`policySignature.${field} must be a non-empty string.`);
    }
  }
  return {
    algorithm: "ed25519",
    keyId: data["keyId"] as string,
    publicKeyPem: data["publicKeyPem"] as string,
    policyDigest: data["policyDigest"] as string,
    signatureBase64: data["signatureBase64"] as string,
  };
}
