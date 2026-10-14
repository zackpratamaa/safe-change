import { createHash, verify } from "node:crypto";
import { canonicalizeJson } from "../attestation/canonical.js";
import type {
  IdentityPublicKey,
  SignedApprovalGrant,
  SignedApprovalVerification,
  TrustRegistry,
} from "./types.js";
import { findIdentity } from "./registry.js";

export function verifyApprovalGrantSignature(
  grant: SignedApprovalGrant,
  publicKeyPem: string
): boolean {
  const { signature, ...rest } = grant;
  const canonicalPayload = canonicalizeJson(rest);
  const domainSeparated = Buffer.from(
    `SAFE_CHANGE_APPROVAL_GRANT_V1:${canonicalPayload}`,
    "utf-8"
  );

  try {
    const sigBytes = Buffer.from(signature, "base64");
    return verify(null, domainSeparated, publicKeyPem, sigBytes);
  } catch {
    return false;
  }
}

export function verifySignedApprovalGrant(
  grant: SignedApprovalGrant,
  registry: TrustRegistry,
  options?: {
    readonly expectedRepository?: string;
    readonly expectedCapability?: string;
    readonly expectedResource?: string;
    readonly expectedRequestId?: string;
    readonly expectedRequestDigest?: string;
    readonly expectedRequesterSession?: string;
    readonly expectedPolicyDigest?: string;
    readonly allowedRoles?: readonly IdentityPublicKey["role"][];
    readonly prohibitSelfApproval?: boolean;
  }
): SignedApprovalVerification {
  const reasons: string[] = [];

  // 1. Check Identity Registry
  const identity = findIdentity(registry, grant.approverKeyId);
  if (!identity) {
    return {
      valid: false,
      reasons: [
        `Approver keyId '${grant.approverKeyId}' is not found in the trust registry`,
      ],
      grant,
    };
  }

  // 2. Check Approver Identity Matches Registered Owner
  if (
    grant.approverIdentity.trim().toLowerCase() !==
    identity.owner.trim().toLowerCase()
  ) {
    reasons.push(
      `Grant approverIdentity '${grant.approverIdentity}' does not match trusted identity owner '${identity.owner}'`
    );
  }

  // 3. Check Key Revocation
  if (identity.revoked) {
    reasons.push(
      `Approver keyId '${identity.keyId}' was revoked at ${identity.revokedAt}: ${identity.revocationReason}`
    );
  }

  // 3. Check Key Validity Window
  const now = Date.now();
  const validFrom = new Date(identity.validFrom).getTime();
  const validUntil = new Date(identity.validUntil).getTime();
  if (
    !Number.isFinite(validFrom) ||
    !Number.isFinite(validUntil) ||
    validFrom > validUntil ||
    now < validFrom ||
    now > validUntil
  ) {
    reasons.push(
      `Approver keyId '${identity.keyId}' is outside its validity window (${identity.validFrom} to ${identity.validUntil})`
    );
  }

  // 4. Check Grant Expiration
  const grantExpires = new Date(grant.expiresAt).getTime();
  if (!Number.isFinite(grantExpires) || now > grantExpires) {
    reasons.push(`Approval grant expired at ${grant.expiresAt}`);
  }

  // 5. Check Self-Approval
  if (options?.prohibitSelfApproval ?? true) {
    if (
      grant.requester.toLowerCase() === grant.approverIdentity.toLowerCase() ||
      grant.requester.toLowerCase() === identity.owner.toLowerCase()
    ) {
      reasons.push(
        `Self-approval is prohibited: requester '${grant.requester}' cannot approve own request`
      );
    }
  }

  // 6. Check Repository Identity Binding
  if (
    options?.expectedRepository &&
    grant.repositoryIdentity !== options.expectedRepository
  ) {
    reasons.push(
      `Repository identity mismatch: grant binds '${grant.repositoryIdentity}', expected '${options.expectedRepository}'`
    );
  }

  // 7. Check Capability & Resource Binding
  if (
    options?.expectedCapability &&
    grant.capability !== options.expectedCapability
  ) {
    reasons.push(
      `Capability mismatch: grant binds '${grant.capability}', expected '${options.expectedCapability}'`
    );
  }
  if (options?.expectedResource && grant.resource !== options.expectedResource) {
    reasons.push(
      `Resource mismatch: grant binds '${grant.resource}', expected '${options.expectedResource}'`
    );
  }
  if (
    options?.expectedRequestId &&
    grant.requestId !== options.expectedRequestId
  ) {
    reasons.push("Approval request ID does not match the expected request.");
  }
  if (
    options?.expectedRequestDigest &&
    grant.requestDigest !== options.expectedRequestDigest
  ) {
    reasons.push("Approval request digest does not match the expected request.");
  }
  if (
    options?.expectedRequesterSession &&
    grant.requesterSession !== options.expectedRequesterSession
  ) {
    reasons.push("Approval requester session does not match.");
  }
  if (
    options?.expectedPolicyDigest &&
    grant.policyDigest !== options.expectedPolicyDigest
  ) {
    reasons.push("Approval policy digest does not match the active policy.");
  }
  if (grant.approverRole !== identity.role) {
    reasons.push(
      `Grant role '${grant.approverRole}' does not match trusted identity role '${identity.role}'.`
    );
  }
  if (
    options?.allowedRoles &&
    !options.allowedRoles.includes(identity.role)
  ) {
    reasons.push(
      `Trusted identity role '${identity.role}' is not authorized for this capability.`
    );
  }

  // 8. Cryptographic Signature Verification
  const signatureValid = verifyApprovalGrantSignature(
    grant,
    identity.publicKeyPem
  );
  if (!signatureValid) {
    reasons.push("Cryptographic Ed25519 signature verification failed");
  }

  return {
    valid: reasons.length === 0,
    reasons,
    grant,
    identity,
  };
}

export interface ApprovalChainVerification {
  readonly valid: boolean;
  readonly distinctApproverCount: number;
  readonly requiredThreshold: number;
  readonly reasons: readonly string[];
}

function canonicalGrantDigest(grant: SignedApprovalGrant): string {
  return createHash("sha256")
    .update(canonicalizeJson(grant), "utf8")
    .digest("hex");
}

export function verifyApprovalThreshold(
  grants: readonly SignedApprovalGrant[],
  registry: TrustRegistry,
  threshold: number,
  options?: {
    readonly expectedRepository?: string;
    readonly expectedCapability?: string;
    readonly expectedResource?: string;
    readonly expectedRequestId?: string;
    readonly expectedRequestDigest?: string;
    readonly expectedRequesterSession?: string;
    readonly expectedPolicyDigest?: string;
    readonly allowedRoles?: readonly IdentityPublicKey["role"][];
    readonly prohibitSelfApproval?: boolean;
  }
): ApprovalChainVerification {
  const reasons: string[] = [];
  const validKeyIds = new Set<string>();
  const validApproverIdentities = new Set<string>();
  const validPrincipals = new Set<string>();
  const validPublicKeys = new Set<string>();
  const seenNonces = new Set<string>();
  let expectedPreviousDigest = "";

  for (const grant of grants) {
    if (grant.previousGrantDigest !== expectedPreviousDigest) {
      reasons.push(
        `Grant '${grant.approvalId}' does not continue the signed approval chain.`
      );
      continue;
    }
    if (seenNonces.has(grant.nonce)) {
      reasons.push(`Grant '${grant.approvalId}' reuses an approval nonce.`);
      continue;
    }
    seenNonces.add(grant.nonce);

    const res = verifySignedApprovalGrant(grant, registry, options);
    if (!res.valid) {
      reasons.push(
        `Grant '${grant.approvalId}' from approver '${grant.approverIdentity}' failed verification: ${res.reasons.join(", ")}`
      );
      continue;
    }

    if (grant.decision !== "approved") {
      reasons.push(
        `Grant '${grant.approvalId}' has non-approved decision '${grant.decision}'`
      );
      continue;
    }

    // Advance chain digest for any valid, approved grant in the sequence
    expectedPreviousDigest = canonicalGrantDigest(grant);

    const identity = findIdentity(registry, grant.approverKeyId);
    const principal = (identity?.owner || grant.approverIdentity).trim().toLowerCase();
    const normalizedKey = identity ? identity.publicKeyPem.replace(/\s+/g, "") : "";

    // Deduplicate: multiple signatures from the same key, owner/principal, or public key count once
    if (
      validKeyIds.has(grant.approverKeyId) ||
      validPrincipals.has(principal) ||
      (normalizedKey && validPublicKeys.has(normalizedKey))
    ) {
      continue;
    }

    validKeyIds.add(grant.approverKeyId);
    validPrincipals.add(principal);
    if (normalizedKey) {
      validPublicKeys.add(normalizedKey);
    }
    validApproverIdentities.add(grant.approverIdentity);
  }

  const distinctCount = validPrincipals.size;
  if (distinctCount < threshold) {
    reasons.push(
      `Insufficient approved signatures: received ${distinctCount} valid distinct signatures, required threshold is ${threshold}`
    );
  }

  return {
    valid: reasons.length === 0 && distinctCount >= threshold,
    distinctApproverCount: distinctCount,
    requiredThreshold: threshold,
    reasons,
  };
}
