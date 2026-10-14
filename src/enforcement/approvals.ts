import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ApprovalRequest,
  Capability,
} from "../types/index.js";
import { stableDigest } from "../integrity/hash.js";
import { appendAuditEvent } from "../integrity/audit-log.js";
import type { SignedApprovalGrant } from "../identity/types.js";

const ID_PATTERN = /^[A-Za-z0-9-]{8,80}$/;

function approvalPath(repoRoot: string, id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error("Invalid approval request ID.");
  return join(repoRoot, ".safe-change", "approvals", `${id}.json`);
}

function unsignedRequest(request: ApprovalRequest): object {
  return {
    schemaVersion: request.schemaVersion,
    id: request.id,
    capability: request.capability,
    resource: request.resource,
    requester: request.requester,
    sessionId: request.sessionId,
    reason: request.reason,
    requestedAt: request.requestedAt,
    expiresAt: request.expiresAt,
  };
}

export function verifyApprovalRequest(request: ApprovalRequest): boolean {
  if (request.requestDigest !== stableDigest(unsignedRequest(request))) {
    return false;
  }
  let previousDigest: string | null = null;
  for (const grant of request.grants) {
    if (grant.previousDigest !== previousDigest) return false;
    const digest = stableDigest({
      approver: grant.approver,
      grantedAt: grant.grantedAt,
      previousDigest: grant.previousDigest,
      requestDigest: request.requestDigest,
    });
    if (grant.grantDigest !== digest) return false;
    previousDigest = grant.grantDigest;
  }
  return true;
}

export async function createApprovalRequest(
  repoRoot: string,
  input: {
    capability: Capability;
    resource: string;
    requester: string;
    sessionId: string;
    reason: string;
    ttlSeconds: number;
  }
): Promise<ApprovalRequest> {
  if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 60) {
    throw new Error("Approval TTL must be an integer of at least 60 seconds.");
  }
  const now = new Date();
  const requestWithoutDigest = {
    schemaVersion: 1 as const,
    id: randomUUID(),
    capability: input.capability,
    resource: input.resource,
    requester: input.requester,
    sessionId: input.sessionId,
    reason: input.reason,
    requestedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.ttlSeconds * 1000).toISOString(),
  };
  const request: ApprovalRequest = {
    ...requestWithoutDigest,
    requestDigest: stableDigest(requestWithoutDigest),
    grants: [],
  };
  const directory = join(repoRoot, ".safe-change", "approvals");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(
    approvalPath(repoRoot, request.id),
    `${JSON.stringify(request, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600, flag: "wx" }
  );
  await appendAuditEvent(
    repoRoot,
    "APPROVAL_REQUESTED",
    input.sessionId,
    requestWithoutDigest
  );
  return request;
}

export async function readApprovalRequest(
  repoRoot: string,
  id: string
): Promise<ApprovalRequest> {
  const request = JSON.parse(
    await readFile(approvalPath(repoRoot, id), "utf8")
  ) as ApprovalRequest;
  if (!verifyApprovalRequest(request)) {
    throw new Error("Approval request integrity verification failed.");
  }
  return request;
}

export async function grantApproval(
  repoRoot: string,
  id: string,
  approver: string,
  prohibitSelfApproval: boolean
): Promise<ApprovalRequest> {
  const request = await readApprovalRequest(repoRoot, id);
  const expiresAtMs = Date.parse(request.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new Error("Approval request has expired or has an invalid expiration timestamp.");
  }
  if (prohibitSelfApproval && request.requester === approver) {
    throw new Error("Requester cannot approve their own operation.");
  }
  if (request.grants.some((grant) => grant.approver === approver)) {
    return request;
  }
  const updated: ApprovalRequest = {
    ...request,
    grants: [
      ...request.grants,
      (() => {
        const unsignedGrant = {
          approver,
          grantedAt: new Date().toISOString(),
          previousDigest: request.grants.at(-1)?.grantDigest ?? null,
          requestDigest: request.requestDigest,
        };
        return {
          approver: unsignedGrant.approver,
          grantedAt: unsignedGrant.grantedAt,
          previousDigest: unsignedGrant.previousDigest,
          grantDigest: stableDigest(unsignedGrant),
        };
      })(),
    ],
  };
  await writeFile(
    approvalPath(repoRoot, id),
    `${JSON.stringify(updated, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 }
  );
  await appendAuditEvent(
    repoRoot,
    "APPROVAL_GRANTED",
    request.sessionId,
    { id, approver, requestDigest: request.requestDigest }
  );
  return updated;
}

export async function appendSignedApprovalGrant(
  repoRoot: string,
  id: string,
  grant: SignedApprovalGrant
): Promise<ApprovalRequest> {
  const request = await readApprovalRequest(repoRoot, id);
  const expiresAtMs = Date.parse(request.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new Error("Approval request has expired or has an invalid expiration timestamp.");
  }
  if (
    grant.requestId !== request.id ||
    grant.requestDigest !== request.requestDigest ||
    grant.capability !== request.capability ||
    grant.resource !== request.resource ||
    grant.requester !== request.requester ||
    grant.requesterSession !== request.sessionId
  ) {
    throw new Error("Signed approval grant does not match its request.");
  }
  const signedGrants = request.signedGrants ?? [];
  if (
    signedGrants.some(
      (existing) =>
        existing.approvalId === grant.approvalId ||
        existing.approverKeyId === grant.approverKeyId ||
        existing.nonce === grant.nonce
    )
  ) {
    throw new Error("Duplicate or replayed signed approval grant.");
  }
  const updated: ApprovalRequest = {
    ...request,
    signedGrants: [...signedGrants, grant],
  };
  await writeFile(
    approvalPath(repoRoot, id),
    `${JSON.stringify(updated, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 }
  );
  await appendAuditEvent(repoRoot, "SIGNED_APPROVAL_GRANTED", request.sessionId, {
    id,
    approvalId: grant.approvalId,
    approverKeyId: grant.approverKeyId,
    requestDigest: request.requestDigest,
  });
  return updated;
}