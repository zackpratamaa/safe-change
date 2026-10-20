import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";
import type {
  EnforcementPolicy,
  PolicySignature,
} from "../../src/types/index.js";
import {
  enforcementPolicyDigest,
  verifyPolicySignature,
  signEnforcementPolicy,
} from "../../src/enforcement/policy-signature.js";
import { runPolicySign, runPolicyVerify } from "../../src/commands/policy.js";
import { stableStringify } from "../../src/integrity/hash.js";
import { evaluateOperation } from "../../src/enforcement/decision.js";
import { validateEnforcementPolicy } from "../../src/enforcement/config.js";
import {
  createApprovalRequest,
  grantApproval,
  readApprovalRequest,
  verifyApprovalRequest,
} from "../../src/enforcement/approvals.js";
import { loadConfig, ConfigError } from "../../src/config/loader.js";

function policy(overrides: Partial<EnforcementPolicy> = {}): EnforcementPolicy {
  return {
    policyVersion: 1,
    defaultDecision: "deny",
    requireSignedPolicy: false,
    agents: [
      {
        agent: "codex",
        allow: [
          "repository:read",
          "source:write",
          "tests:execute",
          "release:publish",
        ],
        deny: ["secret:read"],
        resourcePatterns: ["src/**", "release/**"],
        expiresAt: null,
      },
    ],
    commandSandbox: {
      allowedExecutables: ["node", "npm"],
      deniedArguments: ["--force", "--no-verify"],
      allowedEnvironment: ["PATH"],
      inheritEnvironment: false,
      networkPolicy: "inherit",
      maxOutputBytes: 102_400,
    },
    approvals: {
      thresholds: { "release:publish": 2 },
      prohibitSelfApproval: true,
      maximumExceptionTtlSeconds: 3600,
    },
    ...overrides,
  };
}

function signPolicy(value: EnforcementPolicy): PolicySignature {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    algorithm: "ed25519",
    keyId: "test-security-owner",
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    policyDigest: enforcementPolicyDigest(value),
    signatureBase64: sign(
      null,
      Buffer.from(stableStringify(value), "utf8"),
      privateKey,
    ).toString("base64"),
  };
}

describe("Enforcement Core", () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await createTempRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it("verifies an Ed25519 policy signature and rejects policy drift", () => {
    const original = policy({ requireSignedPolicy: true });
    const signature = signPolicy(original);
    expect(verifyPolicySignature(original, signature).valid).toBe(true);

    const changed = {
      ...original,
      requireSignedPolicy: false,
    };
    const result = verifyPolicySignature(changed, signature);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("digest does not match");
  });

  it("fails configuration loading when a required signature is missing", async () => {
    await repo.writeFile(
      ".safe-change.json",
      JSON.stringify({
        version: 1,
        checks: [],
        enforcementPolicy: policy({ requireSignedPolicy: true }),
      }),
    );
    await expect(loadConfig(repo.path)).rejects.toThrow(ConfigError);
    await expect(loadConfig(repo.path)).rejects.toThrow(
      "Policy signature is missing",
    );
  });

  it("loads and verifies a signed enforcement policy", async () => {
    const signedPolicy = policy({ requireSignedPolicy: true });
    await repo.writeFile(
      ".safe-change.json",
      JSON.stringify({
        version: 1,
        checks: [],
        enforcementPolicy: signedPolicy,
        policySignature: signPolicy(signedPolicy),
      }),
    );
    const config = await loadConfig(repo.path);
    expect(config.enforcementPolicy?.requireSignedPolicy).toBe(true);
    expect(
      verifyPolicySignature(config.enforcementPolicy!, config.policySignature)
        .valid,
    ).toBe(true);
  });

  it("verifies policies with explicit requireSignedApprovals: false and requireSignedApprovals: true", async () => {
    // 1. Explicit requireSignedApprovals: false
    const policyFalse = policy({
      requireSignedPolicy: true,
      approvals: {
        thresholds: { "release:publish": 2 },
        prohibitSelfApproval: true,
        requireSignedApprovals: false,
        maximumExceptionTtlSeconds: 3600,
      },
    });
    const sigFalse = signPolicy(policyFalse);
    expect(verifyPolicySignature(policyFalse, sigFalse).valid).toBe(true);

    // 2. Explicit requireSignedApprovals: true
    const policyTrue = policy({
      requireSignedPolicy: true,
      approvals: {
        thresholds: { "release:publish": 2 },
        prohibitSelfApproval: true,
        requireSignedApprovals: true,
        maximumExceptionTtlSeconds: 3600,
      },
    });
    const sigTrue = signPolicy(policyTrue);
    expect(verifyPolicySignature(policyTrue, sigTrue).valid).toBe(true);

    // 3. Mutating true -> false must fail signature verification
    const mutatedToFalse = {
      ...policyTrue,
      approvals: {
        ...policyTrue.approvals,
        requireSignedApprovals: false,
      },
    };
    expect(verifyPolicySignature(mutatedToFalse, sigTrue).valid).toBe(false);

    // 4. Mutating false -> true must fail signature verification
    const mutatedToTrue = {
      ...policyFalse,
      approvals: {
        ...policyFalse.approvals,
        requireSignedApprovals: true,
      },
    };
    expect(verifyPolicySignature(mutatedToTrue, sigFalse).valid).toBe(false);

    // 5. Mutating omitted -> true must fail signature verification
    const legacyPolicy = policy({ requireSignedPolicy: true });
    const legacySig = signPolicy(legacyPolicy);
    expect(verifyPolicySignature(mutatedToTrue, legacySig).valid).toBe(false);

    // 6. Mutating approval threshold must fail signature verification
    const mutatedThreshold = {
      ...policyTrue,
      approvals: {
        ...policyTrue.approvals,
        thresholds: { "release:publish": 1 },
      },
    };
    expect(verifyPolicySignature(mutatedThreshold, sigTrue).valid).toBe(false);

    // 7. Mutating allow/deny capability or resource scope must fail signature verification
    const mutatedScope = {
      ...policyTrue,
      agents: [
        {
          ...policyTrue.agents[0]!,
          resourcePatterns: ["**"],
        },
      ],
    };
    expect(verifyPolicySignature(mutatedScope, sigTrue).valid).toBe(false);

    const mutatedDeny = {
      ...policyTrue,
      agents: [
        {
          ...policyTrue.agents[0]!,
          deny: [],
        },
      ],
    };
    expect(verifyPolicySignature(mutatedDeny, sigTrue).valid).toBe(false);
  });

  it("rejects configuration when signature is stale, malformed, or tampered", async () => {
    const validPolicy = policy({ requireSignedPolicy: true });
    const validSig = signPolicy(validPolicy);

    // Malformed signature base64
    await repo.writeFile(
      ".safe-change.json",
      JSON.stringify({
        version: 1,
        checks: [],
        enforcementPolicy: validPolicy,
        policySignature: {
          ...validSig,
          signatureBase64: "bm90LWEtdmFsaWQtZWQyNTUxOS1zaWduYXR1cmU=",
        },
      }),
    );
    await expect(loadConfig(repo.path)).rejects.toThrow(ConfigError);

    // Stale signature (signature from another policy)
    const anotherPolicy = policy({
      requireSignedPolicy: true,
      defaultDecision: "deny",
    });
    const staleSig = signPolicy({
      ...anotherPolicy,
      commandSandbox: {
        ...anotherPolicy.commandSandbox,
        maxOutputBytes: 204_800,
      },
    });
    await repo.writeFile(
      ".safe-change.json",
      JSON.stringify({
        version: 1,
        checks: [],
        enforcementPolicy: validPolicy,
        policySignature: staleSig,
      }),
    );
    await expect(loadConfig(repo.path)).rejects.toThrow(ConfigError);
  });

  it("canonicalization ignores property key order and verifies identical semantics", async () => {
    // Construct approvals with reverse property insertion order
    const reversedApprovals: any = {};
    reversedApprovals.maximumExceptionTtlSeconds = 3600;
    reversedApprovals.prohibitSelfApproval = true;
    reversedApprovals.thresholds = { "release:publish": 2 };

    const policyA = policy({ requireSignedPolicy: true });
    const policyB = {
      ...policyA,
      approvals: reversedApprovals,
    };

    const sigA = signPolicy(policyA);
    expect(verifyPolicySignature(policyB, sigA).valid).toBe(true);
  });

  it("denies explicit capability and out-of-scope resource access", async () => {
    const denied = await evaluateOperation(repo.path, policy(), undefined, {
      sessionId: "session-a",
      agentName: "codex",
      capability: "secret:read",
      resource: "src/secret.ts",
    });
    expect(denied.decision).toBe("deny");
    expect(denied.reasons.join(" ")).toContain("explicitly denied");

    const outOfScope = await evaluateOperation(repo.path, policy(), undefined, {
      sessionId: "session-a",
      agentName: "codex",
      capability: "source:write",
      resource: "docs/readme.md",
    });
    expect(outOfScope.decision).toBe("deny");
    expect(outOfScope.reasons.join(" ")).toContain("outside the agent scope");
  });

  it("allows a scoped capability without an approval threshold", async () => {
    const decision = await evaluateOperation(repo.path, policy(), undefined, {
      sessionId: "session-a",
      agentName: "codex",
      capability: "source:write",
      resource: "src/index.ts",
    });
    expect(decision.decision).toBe("allow");
  });

  it("denies unknown agents and rejects a default-allow policy", async () => {
    const denied = await evaluateOperation(repo.path, policy(), undefined, {
      sessionId: "session-unknown",
      agentName: "unknown-agent",
      capability: "repository:read",
      resource: "src/index.ts",
    });
    expect(denied.decision).toBe("deny");

    expect(() =>
      validateEnforcementPolicy({
        ...policy(),
        defaultDecision: "allow",
      }),
    ).toThrow("must be deny for fail-closed enforcement");
  });

  it("denies expired capability grants", async () => {
    const expired = policy({
      agents: [
        {
          agent: "codex",
          allow: ["source:write"],
          deny: [],
          resourcePatterns: ["src/**"],
          expiresAt: "2020-01-01T00:00:00.000Z",
        },
      ],
    });
    const decision = await evaluateOperation(repo.path, expired, undefined, {
      sessionId: "session-expired",
      agentName: "codex",
      capability: "source:write",
      resource: "src/index.ts",
    });
    expect(decision.decision).toBe("deny");
    expect(decision.reasons.join(" ")).toContain("expired");
  });

  it("requires distinct approvals and prohibits self-approval", async () => {
    const request = await createApprovalRequest(repo.path, {
      capability: "release:publish",
      resource: "release/safe-change-0.4.0.tgz",
      requester: "codex",
      sessionId: "session-release",
      reason: "Publish exact verified artifact.",
      ttlSeconds: 600,
    });
    await expect(
      grantApproval(repo.path, request.id, "codex", true),
    ).rejects.toThrow("cannot approve");

    const one = await grantApproval(
      repo.path,
      request.id,
      "release-owner",
      true,
    );
    expect(one.grants).toHaveLength(1);
    const duplicate = await grantApproval(
      repo.path,
      request.id,
      "release-owner",
      true,
    );
    expect(duplicate.grants).toHaveLength(1);
    let decision = await evaluateOperation(repo.path, policy(), undefined, {
      sessionId: "session-release",
      agentName: "codex",
      capability: "release:publish",
      resource: "release/safe-change-0.4.0.tgz",
      approvalRequestId: request.id,
    });
    expect(decision.decision).toBe("require-approval");

    await grantApproval(repo.path, request.id, "security-owner", true);
    decision = await evaluateOperation(repo.path, policy(), undefined, {
      sessionId: "session-release",
      agentName: "codex",
      capability: "release:publish",
      resource: "release/safe-change-0.4.0.tgz",
      approvalRequestId: request.id,
    });
    expect(decision.decision).toBe("allow");
  });

  it("rejects an approval bound to a different resource", async () => {
    const request = await createApprovalRequest(repo.path, {
      capability: "release:publish",
      resource: "release/approved.tgz",
      requester: "codex",
      sessionId: "session-bound",
      reason: "Bound approval.",
      ttlSeconds: 600,
    });
    await grantApproval(repo.path, request.id, "release-owner", true);
    await grantApproval(repo.path, request.id, "security-owner", true);
    const decision = await evaluateOperation(repo.path, policy(), undefined, {
      sessionId: "session-bound",
      agentName: "codex",
      capability: "release:publish",
      resource: "release/different.tgz",
      approvalRequestId: request.id,
    });
    expect(decision.decision).toBe("deny");
    expect(decision.reasons.join(" ")).toContain("does not match");
  });

  it("detects tampering with request fields and approval grant chains", async () => {
    const request = await createApprovalRequest(repo.path, {
      capability: "release:publish",
      resource: "release/artifact.tgz",
      requester: "codex",
      sessionId: "session-integrity",
      reason: "Integrity test.",
      ttlSeconds: 600,
    });
    const granted = await grantApproval(
      repo.path,
      request.id,
      "release-owner",
      true,
    );
    expect(verifyApprovalRequest(granted)).toBe(true);

    const path = join(
      repo.path,
      ".safe-change",
      "approvals",
      `${request.id}.json`,
    );
    const content = await readFile(path, "utf8");
    await writeFile(path, content.replace("release-owner", "attacker"));
    await expect(readApprovalRequest(repo.path, request.id)).rejects.toThrow(
      "integrity verification failed",
    );
  });

  it("programmatically signs enforcement policy with signEnforcementPolicy", () => {
    const original = policy({ requireSignedPolicy: true });
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const sig = signEnforcementPolicy(original, {
      keyId: "org-security-lead",
      privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    });

    expect(sig.algorithm).toBe("ed25519");
    expect(sig.keyId).toBe("org-security-lead");
    expect(sig.policyDigest).toBe(enforcementPolicyDigest(original));

    const verification = verifyPolicySignature(original, sig);
    expect(verification.valid).toBe(true);
    expect(verification.reason).toContain("valid");
  });

  it("executes runPolicySign to sign and write policySignature to .safe-change.json", async () => {
    const originalCwd = process.cwd();
    // Capture this disposable key-generating CLI response inside the test. Do not
    // leak generated private-key material into the suite/coverage stdout.
    const output: string[] = [];
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => {
      output.push(String(chunk)); return true;
    });
    process.chdir(repo.path);
    try {
      const config = {
        version: 1,
        checks: [{ name: "build", executable: "npm", args: ["run", "build"] }],
        enforcementPolicy: policy(),
      };
      await writeFile(
        join(repo.path, ".safe-change.json"),
        JSON.stringify(config, null, 2),
        "utf8"
      );

      const exitCode = await runPolicySign({
        format: "json",
        keyId: "owner-key-1",
        write: true,
      });
      expect(exitCode).toBe(0);

      const written = JSON.parse(
        await readFile(join(repo.path, ".safe-change.json"), "utf8")
      );
      expect(written.policySignature).toBeDefined();
      expect(written.policySignature.keyId).toBe("owner-key-1");
      expect(written.policySignature.algorithm).toBe("ed25519");
      const signedOutput = JSON.parse(output.join(""));
      expect(signedOutput.success).toBe(true);
      expect(typeof signedOutput.generatedPrivateKeyPem).toBe("string");
      expect(createPublicKey(signedOutput.generatedPrivateKeyPem).export({ type: "spki", format: "pem" }).toString()).toBe(written.policySignature.publicKeyPem);
      output.length = 0;

      // Verify with runPolicyVerify
      const verifyCode = await runPolicyVerify({ format: "json" });
      expect(verifyCode).toBe(0);
      expect(JSON.parse(output.join("")).valid).toBe(true);
    } finally {
      stdout.mockRestore();
      process.chdir(originalCwd);
    }
  });
});
