import { describe, it, expect } from "vitest";
import { generateKeyPairSync, createHash } from "node:crypto";
import { signApprovalGrant } from "../../src/identity/signer.js";
import { canonicalizeJson } from "../../src/attestation/canonical.js";
import {
  verifySignedApprovalGrant,
  verifyApprovalThreshold,
} from "../../src/identity/verifier.js";
import type {
  IdentityPublicKey,
  TrustRegistry,
} from "../../src/identity/types.js";

describe("Approval Identity Signing & Trust Verification", () => {
  const approver1 = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const approver2 = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const identity1: IdentityPublicKey = {
    keyId: "key-alice",
    publicKeyPem: approver1.publicKey,
    owner: "alice",
    role: "security-lead",
    validFrom: new Date(Date.now() - 3600000).toISOString(),
    validUntil: new Date(Date.now() + 36000000).toISOString(),
    revoked: false,
  };

  const identity2: IdentityPublicKey = {
    keyId: "key-bob",
    publicKeyPem: approver2.publicKey,
    owner: "bob",
    role: "release-manager",
    validFrom: new Date(Date.now() - 3600000).toISOString(),
    validUntil: new Date(Date.now() + 36000000).toISOString(),
    revoked: false,
  };

  const registry: TrustRegistry = {
    version: 1,
    identities: [identity1, identity2],
  };

  const baseParams = {
    requestId: "req-12345",
    requestDigest: "digest-12345",
    repositoryIdentity: "https://github.com/zackpratamaa/safe-change",
    capability: "release:publish" as const,
    resource: "production-release",
    requester: "charlie",
    requesterSession: "session-abc",
    approverIdentity: "alice",
    approverKeyId: "key-alice",
    approverRole: "security-lead" as const,
    policyDigest: "pol-123",
    decision: "approved" as const,
    ttlSeconds: 3600,
    privateKeyPem: approver1.privateKey,
  };

  it("verifies a valid signed approval grant successfully", () => {
    const grant = signApprovalGrant(baseParams);
    const result = verifySignedApprovalGrant(grant, registry, {
      expectedRepository: "https://github.com/zackpratamaa/safe-change",
      expectedCapability: "release:publish",
      expectedResource: "production-release",
      prohibitSelfApproval: true,
    });

    expect(result.valid).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.grant?.approvalId).toBeDefined();
  });

  it("rejects self-approval when requester matches approver identity", () => {
    const grant = signApprovalGrant({
      ...baseParams,
      requester: "alice", // self-approval
    });

    const result = verifySignedApprovalGrant(grant, registry, {
      prohibitSelfApproval: true,
    });

    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("Self-approval is prohibited"))).toBe(
      true
    );
  });

  it("rejects unknown signer not in trust registry", () => {
    const grant = signApprovalGrant({
      ...baseParams,
      approverKeyId: "unknown-key-999",
    });

    const result = verifySignedApprovalGrant(grant, registry);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("not found in the trust registry"))).toBe(
      true
    );
  });

  it("rejects revoked approver keys", () => {
    const revokedRegistry: TrustRegistry = {
      version: 1,
      identities: [
        {
          ...identity1,
          revoked: true,
          revokedAt: new Date().toISOString(),
          revocationReason: "Key compromised",
        },
      ],
    };

    const grant = signApprovalGrant(baseParams);
    const result = verifySignedApprovalGrant(grant, revokedRegistry);

    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("revoked"))).toBe(true);
  });

  it("rejects approval grant with wrong repository identity", () => {
    const grant = signApprovalGrant(baseParams);
    const result = verifySignedApprovalGrant(grant, registry, {
      expectedRepository: "https://github.com/different/repo",
    });

    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("Repository identity mismatch"))).toBe(
      true
    );
  });

  it("rejects approval grant with wrong capability", () => {
    const grant = signApprovalGrant(baseParams);
    const result = verifySignedApprovalGrant(grant, registry, {
      expectedCapability: "secret:read",
    });

    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("Capability mismatch"))).toBe(
      true
    );
  });

  it("rejects tampered grant payload (invalid signature)", () => {
    const grant = signApprovalGrant(baseParams);
    const tamperedGrant = {
      ...grant,
      resource: "different-resource-unauthorized",
    };

    const result = verifySignedApprovalGrant(tamperedGrant, registry);
    expect(result.valid).toBe(false);
    expect(
      result.reasons.some((r) => r.includes("signature verification failed"))
    ).toBe(true);
  });

  it("enforces multi-approver threshold with distinct keys", () => {
    const grant1 = signApprovalGrant(baseParams);
    const grant2 = signApprovalGrant({
      ...baseParams,
      approverIdentity: "bob",
      approverKeyId: "key-bob",
      approverRole: "release-manager",
      previousGrantDigest: createHash("sha256")
        .update(canonicalizeJson(grant1), "utf8")
        .digest("hex"),
      privateKeyPem: approver2.privateKey,
    });

    const thresholdResult = verifyApprovalThreshold(
      [grant1, grant2],
      registry,
      2
    );

    expect(thresholdResult.valid).toBe(true);
    expect(thresholdResult.distinctApproverCount).toBe(2);
  });

  it("counts duplicate signatures from the same key only once towards threshold", () => {
    const grant1 = signApprovalGrant(baseParams);
    const grant1Duplicate = signApprovalGrant(baseParams);

    const thresholdResult = verifyApprovalThreshold(
      [grant1, grant1Duplicate],
      registry,
      2 // required 2 distinct approvers
    );

    expect(thresholdResult.valid).toBe(false);
    expect(thresholdResult.distinctApproverCount).toBe(1);
    expect(
      thresholdResult.reasons.some((r) => r.includes("Insufficient approved signatures"))
    ).toBe(true);
  });

  it("prevents a single owner with two different keyIds from satisfying threshold 2", () => {
    // Generate a second key pair for alice
    const approver1SecondKey = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    const identity1SecondKey: IdentityPublicKey = {
      keyId: "key-alice-backup",
      publicKeyPem: approver1SecondKey.publicKey,
      owner: "alice", // same owner!
      role: "security-lead",
      validFrom: new Date(Date.now() - 3600000).toISOString(),
      validUntil: new Date(Date.now() + 36000000).toISOString(),
      revoked: false,
    };

    const multiKeyRegistry: TrustRegistry = {
      version: 1,
      identities: [identity1, identity1SecondKey],
    };

    const grant1 = signApprovalGrant({
      ...baseParams,
      approverIdentity: "alice",
      approverKeyId: "key-alice",
      privateKeyPem: approver1.privateKey,
    });

    const grant2FromSameOwner = signApprovalGrant({
      ...baseParams,
      approverIdentity: "alice",
      approverKeyId: "key-alice-backup",
      previousGrantDigest: createHash("sha256")
        .update(canonicalizeJson(grant1), "utf8")
        .digest("hex"),
      privateKeyPem: approver1SecondKey.privateKey,
    });

    const thresholdResult = verifyApprovalThreshold(
      [grant1, grant2FromSameOwner],
      multiKeyRegistry,
      2
    );

    // Must fail because both keys belong to "alice"
    expect(thresholdResult.valid).toBe(false);
    expect(thresholdResult.distinctApproverCount).toBe(1);
    expect(
      thresholdResult.reasons.some((r) => r.includes("Insufficient approved signatures"))
    ).toBe(true);
  });

  it("rejects grant with invalid/NaN expiration date", () => {
    const validGrant = signApprovalGrant({
      ...baseParams,
      privateKeyPem: approver1.privateKey,
    });
    const grant = {
      ...validGrant,
      expiresAt: "invalid-not-a-date",
    };

    const result = verifySignedApprovalGrant(grant, registry);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("expired"))).toBe(true);
  });

  it("rejects identity with invalid/NaN validity window", () => {
    const invalidWindowIdentity: IdentityPublicKey = {
      ...identity1,
      keyId: "key-alice-nan",
      validFrom: "invalid-from",
      validUntil: "invalid-until",
    };

    const badRegistry: TrustRegistry = {
      version: 1,
      identities: [invalidWindowIdentity],
    };

    const grant = signApprovalGrant({
      ...baseParams,
      approverKeyId: "key-alice-nan",
      privateKeyPem: approver1.privateKey,
    });

    const result = verifySignedApprovalGrant(grant, badRegistry);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("validity window"))).toBe(true);
  });
});
