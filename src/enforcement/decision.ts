import type {
  Capability,
  EnforcementPolicy,
  OperationRequest,
  PolicyDecision,
  PolicySignature,
} from "../types/index.js";
import { matchGlob } from "../rules/engine.js";
import { readApprovalRequest } from "./approvals.js";
import {
  enforcementPolicyDigest,
  verifyPolicySignature,
} from "./policy-signature.js";
import { loadTrustRegistry } from "../identity/registry.js";
import { verifyApprovalThreshold } from "../identity/verifier.js";

const CAPABILITIES: readonly Capability[] = [
  "repository:read",
  "source:write",
  "tests:execute",
  "dependency:modify",
  "ci:modify",
  "git:commit",
  "git:push",
  "release:publish",
  "policy:modify",
  "secret:read",
];

const APPROVER_ROLES: Readonly<
  Partial<Record<Capability, readonly ("security-lead" | "release-manager" | "lead-maintainer" | "developer")[]>>
> = {
  "release:publish": ["release-manager", "security-lead"],
  "policy:modify": ["security-lead"],
  "ci:modify": ["security-lead", "lead-maintainer"],
  "dependency:modify": ["security-lead", "lead-maintainer"],
};

export function isCapability(value: string): value is Capability {
  return CAPABILITIES.includes(value as Capability);
}

export async function evaluateOperation(
  repoRoot: string,
  policy: EnforcementPolicy,
  signature: PolicySignature | undefined,
  request: OperationRequest,
): Promise<PolicyDecision> {
  const reasons: string[] = [];
  const policyDigest = enforcementPolicyDigest(policy);
  if (policy.requireSignedPolicy) {
    const verification = verifyPolicySignature(policy, signature);
    if (!verification.valid) reasons.push(verification.reason);
  }

  const agent = policy.agents.find(
    (candidate) =>
      candidate.agent === request.agentName || candidate.agent === "*",
  );
  if (!agent) {
    reasons.push(
      `No capability policy exists for agent "${request.agentName}".`,
    );
  } else {
    if (agent.expiresAt && Date.parse(agent.expiresAt) <= Date.now()) {
      reasons.push(`Capability grant for agent "${agent.agent}" has expired.`);
    }
    if (agent.deny.includes(request.capability)) {
      reasons.push(`Capability "${request.capability}" is explicitly denied.`);
    }
    if (!agent.allow.includes(request.capability)) {
      reasons.push(`Capability "${request.capability}" is not allowlisted.`);
    }
    if (
      agent.resourcePatterns.length > 0 &&
      !agent.resourcePatterns.some((pattern) =>
        matchGlob(request.resource, pattern),
      )
    ) {
      reasons.push(
        `Resource "${request.resource}" is outside the agent scope.`,
      );
    }
  }

  if (reasons.length > 0) {
    return {
      decision: "deny",
      reasons,
      capability: request.capability,
      resource: request.resource,
      policyDigest,
      approvalRequestId: request.approvalRequestId ?? null,
    };
  }

  const threshold = policy.approvals.thresholds[request.capability] ?? 0;
  if (threshold > 0) {
    if (!request.approvalRequestId) {
      return {
        decision: "require-approval",
        reasons: [`Capability requires ${threshold} independent approval(s).`],
        capability: request.capability,
        resource: request.resource,
        policyDigest,
        approvalRequestId: null,
      };
    }
    try {
      const approval = await readApprovalRequest(
        repoRoot,
        request.approvalRequestId,
      );
      if (
        approval.capability !== request.capability ||
        approval.resource !== request.resource ||
        approval.requester !== request.agentName ||
        approval.sessionId !== request.sessionId
      ) {
        reasons.push(
          "Approval request does not match the requested operation.",
        );
      }
      const expiresAtMs = Date.parse(approval.expiresAt);
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
        reasons.push(
          "Approval request has expired or has an invalid expiration timestamp.",
        );
      }
      let approvedCount: number;
      if ((approval.signedGrants?.length ?? 0) > 0) {
        const registry = await loadTrustRegistry(repoRoot);
        const signedResult = verifyApprovalThreshold(
          approval.signedGrants ?? [],
          registry,
          threshold,
          {
            expectedRepository: repoRoot.replace(/\\/g, "/"),
            expectedCapability: request.capability,
            expectedResource: request.resource,
            expectedRequestId: approval.id,
            expectedRequestDigest: approval.requestDigest,
            expectedRequesterSession: request.sessionId,
            expectedPolicyDigest: policyDigest,
            allowedRoles: APPROVER_ROLES[request.capability] ?? [
              "security-lead",
              "lead-maintainer",
            ],
            prohibitSelfApproval: policy.approvals.prohibitSelfApproval,
          },
        );
        if (!signedResult.valid) {
          reasons.push(
            `Signed approval verification failed: ${signedResult.reasons.join(" ")}`,
          );
        }
        approvedCount = signedResult.distinctApproverCount;
      } else if (policy.approvals.requireSignedApprovals) {
        reasons.push(
          "Operation requires cryptographically signed approval grants, but no signed grants were provided.",
        );
        approvedCount = 0;
      } else {
        approvedCount = new Set(
          approval.grants.map((grant) => grant.approver),
        ).size;
      }
      if (approvedCount < threshold) {
        return {
          decision: "require-approval",
          reasons: [
            ...reasons,
            `Operation has ${approvedCount} of ${threshold} required approval(s).`,
          ],
          capability: request.capability,
          resource: request.resource,
          policyDigest,
          approvalRequestId: approval.id,
        };
      }
    } catch (error: unknown) {
      reasons.push(
        `Approval validation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return {
    decision: reasons.length > 0 ? "deny" : "allow",
    reasons:
      reasons.length > 0
        ? reasons
        : [
            "Capability, resource scope, signature, and approval policy passed.",
          ],
    capability: request.capability,
    resource: request.resource,
    policyDigest,
    approvalRequestId: request.approvalRequestId ?? null,
  };
}
