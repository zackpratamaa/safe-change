import { sign, verify } from "node:crypto";
import type {
  EnforcementPolicy,
  PolicySignature,
} from "../types/index.js";
import { stableDigest, stableStringify } from "../integrity/hash.js";

export interface PolicySignatureVerification {
  readonly valid: boolean;
  readonly reason: string;
  readonly computedDigest: string;
}

export function enforcementPolicyDigest(
  policy: EnforcementPolicy
): string {
  return stableDigest(policy);
}

export function signEnforcementPolicy(
  policy: EnforcementPolicy,
  options: {
    readonly keyId: string;
    readonly privateKeyPem: string;
    readonly publicKeyPem: string;
  }
): PolicySignature {
  const computedDigest = enforcementPolicyDigest(policy);
  const signatureBase64 = sign(
    null,
    Buffer.from(stableStringify(policy), "utf8"),
    options.privateKeyPem
  ).toString("base64");

  return {
    algorithm: "ed25519",
    keyId: options.keyId,
    publicKeyPem: options.publicKeyPem,
    policyDigest: computedDigest,
    signatureBase64,
  };
}

export function verifyPolicySignature(
  policy: EnforcementPolicy,
  signature: PolicySignature | undefined
): PolicySignatureVerification {
  const computedDigest = enforcementPolicyDigest(policy);
  if (!signature) {
    return {
      valid: false,
      reason: "Policy signature is missing.",
      computedDigest,
    };
  }
  if (signature.algorithm !== "ed25519") {
    return {
      valid: false,
      reason: "Only Ed25519 policy signatures are supported.",
      computedDigest,
    };
  }
  if (signature.policyDigest !== computedDigest) {
    return {
      valid: false,
      reason: "Signed policy digest does not match the current policy.",
      computedDigest,
    };
  }
  try {
    const valid = verify(
      null,
      Buffer.from(stableStringify(policy), "utf8"),
      signature.publicKeyPem,
      Buffer.from(signature.signatureBase64, "base64")
    );
    return {
      valid,
      reason: valid
        ? "Policy signature is valid."
        : "Policy signature verification failed.",
      computedDigest,
    };
  } catch (error: unknown) {
    return {
      valid: false,
      reason: `Policy signature could not be verified: ${
        error instanceof Error ? error.message : String(error)
      }`,
      computedDigest,
    };
  }
}