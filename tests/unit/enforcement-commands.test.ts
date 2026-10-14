import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";
import { runApproval } from "../../src/commands/approval.js";
import { runAuthorize } from "../../src/commands/authorize.js";
import { runPolicyVerify } from "../../src/commands/policy.js";
import { ExitCodes } from "../../src/types/index.js";

describe("enforcement commands", () => {
  let repo: TempRepo;
  let stdout = "";
  let stderr = "";
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;

  beforeEach(async () => {
    repo = await createTempRepo();
    await repo.writeFile(
      ".safe-change.json",
      JSON.stringify({
        version: 1,
        checks: [],
        enforcementPolicy: {
          policyVersion: 1,
          defaultDecision: "deny",
          requireSignedPolicy: false,
          agents: [
            {
              agent: "codex",
              allow: ["source:write", "release:publish"],
              deny: ["secret:read"],
              resourcePatterns: ["src/**", "release/**"],
              expiresAt: null,
            },
          ],
          commandSandbox: {
            allowedExecutables: ["node"],
            deniedArguments: ["--force"],
            allowedEnvironment: ["PATH"],
            inheritEnvironment: false,
            networkPolicy: "inherit",
            maxOutputBytes: 4096,
          },
          approvals: {
            thresholds: { "release:publish": 2 },
            prohibitSelfApproval: true,
            maximumExceptionTtlSeconds: 3600,
          },
        },
      })
    );
    stdout = "";
    stderr = "";
    process.stdout.write = ((chunk: string | Buffer) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Buffer) => {
      stderr += chunk.toString();
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(async () => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    await repo.cleanup();
  });

  it("authorizes a scoped write and denies a secret read", async () => {
    const originalCwd = process.cwd();
    process.chdir(repo.path);
    try {
      expect(
        await runAuthorize({
          capability: "source:write",
          resource: "src/index.ts",
          agentName: "codex",
          sessionId: "session-command",
          format: "json",
        })
      ).toBe(ExitCodes.OK);
      expect(JSON.parse(stdout).decision).toBe("allow");

      stdout = "";
      expect(
        await runAuthorize({
          capability: "secret:read",
          resource: "src/secrets.ts",
          agentName: "codex",
          sessionId: "session-command",
          format: "json",
        })
      ).toBe(ExitCodes.OWNERSHIP_CONFLICT);
      expect(JSON.parse(stdout).decision).toBe("deny");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("completes an approval request and authorizes the exact operation", async () => {
    const originalCwd = process.cwd();
    process.chdir(repo.path);
    try {
      expect(
        await runApproval({
          action: "request",
          values: [
            "release:publish",
            "release/artifact.tgz",
            "codex",
            "session-release",
            "600",
            "Publish",
            "verified",
            "artifact",
          ],
          format: "json",
        })
      ).toBe(ExitCodes.OK);
      const id = JSON.parse(stdout).id as string;

      for (const approver of ["release-owner", "security-owner"]) {
        stdout = "";
        expect(
          await runApproval({
            action: "grant",
            values: [id, approver],
            format: "json",
          })
        ).toBe(ExitCodes.OK);
      }

      stdout = "";
      expect(
        await runApproval({
          action: "status",
          values: [id],
          format: "json",
        })
      ).toBe(ExitCodes.OK);
      expect(JSON.parse(stdout).grants).toHaveLength(2);

      stdout = "";
      expect(
        await runAuthorize({
          capability: "release:publish",
          resource: "release/artifact.tgz",
          agentName: "codex",
          sessionId: "session-release",
          approvalRequestId: id,
          format: "json",
        })
      ).toBe(ExitCodes.OK);
      expect(JSON.parse(stdout).decision).toBe("allow");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("rejects approval requests beyond the maximum TTL", async () => {
    const originalCwd = process.cwd();
    process.chdir(repo.path);
    try {
      expect(
        await runApproval({
          action: "request",
          values: [
            "release:publish",
            "release/artifact.tgz",
            "codex",
            "session-release",
            "7200",
            "Too",
            "long",
          ],
          format: "json",
        })
      ).toBe(ExitCodes.CONFIG_ERROR);
      expect(JSON.parse(stderr).error).toContain("exceeds policy maximum");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("reports unsigned policy as accepted only when signatures are optional", async () => {
    const originalCwd = process.cwd();
    process.chdir(repo.path);
    try {
      expect(await runPolicyVerify({ format: "json" })).toBe(ExitCodes.OK);
      const result = JSON.parse(stdout);
      expect(result.valid).toBe(false);
      expect(result.required).toBe(false);
      expect(result.accepted).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("rejects legacy unauthenticated grants when requireSignedApprovals is true", async () => {
    const originalCwd = process.cwd();
    process.chdir(repo.path);
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const configPath = path.join(repo.path, ".safe-change.json");
      const config = JSON.parse(await fs.readFile(configPath, "utf-8"));
      config.enforcementPolicy.approvals.requireSignedApprovals = true;
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

      stdout = "";
      expect(
        await runApproval({
          action: "request",
          values: [
            "release:publish",
            "release/artifact.tgz",
            "codex",
            "session-release",
            "600",
            "Publish",
            "verified",
            "artifact",
          ],
          format: "json",
        })
      ).toBe(ExitCodes.OK);
      const id = JSON.parse(stdout).id as string;

      for (const approver of ["release-owner", "security-owner"]) {
        stdout = "";
        await runApproval({
          action: "grant",
          values: [id, approver],
          format: "json",
        });
      }

      stdout = "";
      expect(
        await runAuthorize({
          capability: "release:publish",
          resource: "release/artifact.tgz",
          agentName: "codex",
          sessionId: "session-release",
          approvalRequestId: id,
          format: "json",
        })
      ).toBe(ExitCodes.OWNERSHIP_CONFLICT);
      const decision = JSON.parse(stdout);
      expect(decision.decision).toBe("require-approval");
      expect(
        decision.reasons.some((r: string) =>
          r.includes("cryptographically signed approval grants")
        )
      ).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });
});