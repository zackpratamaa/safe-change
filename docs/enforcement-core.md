# Enforcement Core

The Enforcement Core adds capability authorization, a policy decision and enforcement contract, command isolation, detached policy signatures, and expiring multi-party approvals.

## Capability authorization

An agent receives only explicitly configured capabilities:

```json
{
  "agent": "codex",
  "allow": [
    "repository:read",
    "source:write",
    "tests:execute"
  ],
  "deny": [
    "secret:read",
    "release:publish"
  ],
  "resourcePatterns": [
    "src/**",
    "tests/**"
  ],
  "expiresAt": null
}
```

Explicit denial overrides allow. Missing agents and capabilities are denied when `defaultDecision` is `deny`. Expired grants and out-of-scope resources are also denied.

Evaluate an operation before executing it:

```bash
safe-change authorize source:write src/auth/session.ts codex session-123
```

Decisions are `allow`, `deny`, or `require-approval` and are appended to the tamper-evident audit chain.

## Command sandbox

Configured checks can be restricted by:

- executable allowlist;
- exact denied arguments;
- environment-variable allowlist;
- disabled environment inheritance;
- bounded output;
- direct process spawning without a shell;
- mandatory process-tree timeout termination;
- secret redaction before retention.

`networkPolicy: "deny"` requires usable Linux bwrap. macOS/POSIX fallback and native Windows cannot enforce it and block the request. Proxy variables or application cooperation do not provide mandatory network denial. Environment inheritance is enabled by default unless explicitly disabled.

## Approval workflow

Request a scoped approval:

```bash
safe-change approval request \
  release:publish \
  release/safe-change-1.0.0.tgz \
  codex \
  session-release \
  900 \
  "Publish the exact verified artifact"
```

Grant independent approvals:

```bash
safe-change approval grant <request-id> release-owner
safe-change approval grant <request-id> security-owner
```

Authorize the exact approved operation:

```bash
safe-change authorize \
  release:publish \
  release/safe-change-1.0.0.tgz \
  codex \
  session-release \
  <request-id>
```

Requests bind capability, resource, requester, session, reason, and expiration. Grant chains bind each approval to the previous grant and request digest. The requester cannot self-approve when policy prohibits it.

Legacy `approval grant` uses local identifiers, not authenticated enterprise identity. Ed25519 registry-backed `approval sign`/`verify` exist as a separate route; signed grants do not establish external identity-provider integration.

## Signed policy root

`policySignature` supports detached Ed25519 verification:

```json
{
  "algorithm": "ed25519",
  "keyId": "security-owner-2026",
  "publicKeyPem": "-----BEGIN PUBLIC KEY-----...",
  "policyDigest": "sha256:...",
  "signatureBase64": "..."
}
```

The signature covers canonical serialization of the complete `enforcementPolicy`. Any policy-byte-equivalent semantic change produces a different digest and invalidates the signature.

```bash
safe-change policy verify
```

When `requireSignedPolicy` is true, missing, malformed, stale, or invalid signatures prevent configuration loading. The repository does not ship a fabricated organizational private key. Activation requires an owner-controlled external signing key.

## Current boundaries

- The authorization command evaluates a decision and writes an audit event; it does not execute/intercept the requested operation. The caller must enforce the result. Required approval needs an external mandatory boundary.
- Approver identity is backed by local identifiers or cryptographically signed Ed25519 identity assertions (see [Verifiable Execution Guide](verifiable-execution.md)).
- Network denial and process isolation are handled via the OS Sandbox Provider layer (see [Verifiable Execution Architecture](verifiable-execution-architecture.md)).
- Exceptions cannot override explicit capability denial.
- Publishing, tagging, and release creation require separately configured and enforced approvals; calling check alone does not gate them.