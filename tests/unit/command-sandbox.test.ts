import { describe, expect, it } from "vitest";
import { evaluateCommandSandbox } from "../../src/enforcement/sandbox.js";
import { executeCheck } from "../../src/runner/executor.js";
import type { CommandSandboxPolicy } from "../../src/types/index.js";

const POLICY: CommandSandboxPolicy = {
  allowedExecutables: ["node"],
  deniedArguments: ["--force", "--no-verify"],
  allowedEnvironment: ["PATH"],
  inheritEnvironment: false,
  networkPolicy: "inherit",
  maxOutputBytes: 4096,
};

describe("command sandbox", () => {
  it("allows an exact executable and creates an environment allowlist", () => {
    const decision = evaluateCommandSandbox(
      {
        name: "test",
        executable: "node",
        args: ["--version"],
        timeout: 5,
      },
      POLICY,
      { PATH: "/safe/bin", SECRET_ENV: "must-not-pass" }
    );
    expect(decision.allowed).toBe(true);
    expect(decision.environment).toEqual({ PATH: "/safe/bin" });
  });

  it("can inherit the full environment only when policy explicitly allows it", () => {
    const decision = evaluateCommandSandbox(
      {
        name: "inherit",
        executable: "node",
        args: [],
        timeout: 5,
      },
      { ...POLICY, inheritEnvironment: true },
      { PATH: "/safe/bin", EXPLICIT_TEST_VALUE: "present" }
    );
    expect(decision.environment["EXPLICIT_TEST_VALUE"]).toBe("present");
  });

  it("blocks unknown executables and denied arguments", () => {
    const executable = evaluateCommandSandbox(
      {
        name: "shell",
        executable: "bash",
        args: ["script.sh"],
        timeout: 5,
      },
      POLICY
    );
    expect(executable.allowed).toBe(false);
    expect(executable.reasons[0]).toContain("not allowlisted");

    const argument = evaluateCommandSandbox(
      {
        name: "push",
        executable: "node",
        args: ["--force"],
        timeout: 5,
      },
      POLICY
    );
    expect(argument.allowed).toBe(false);
    expect(argument.reasons[0]).toContain("denied");
  });

  it("fails closed when mandatory network denial cannot be enforced", () => {
    const decision = evaluateCommandSandbox(
      {
        name: "network",
        executable: "node",
        args: [],
        timeout: 5,
      },
      { ...POLICY, networkPolicy: "deny" }
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(" ")).toContain(
      "no mandatory OS isolation provider"
    );
  });

  it("allows command sandbox check when OS provider handles network denial", () => {
    const decision = evaluateCommandSandbox(
      {
        name: "network",
        executable: "node",
        args: [],
        timeout: 5,
      },
      { ...POLICY, networkPolicy: "deny" },
      process.env,
      { osProviderHandlesNetworkDeny: true }
    );
    expect(decision.allowed).toBe(true);
  });

  it("does not spawn a blocked command", async () => {
    const result = await executeCheck(
      {
        name: "blocked",
        executable: process.execPath,
        args: ["-e", "process.exit(0)"],
        timeout: 5,
      },
      {
        cwd: process.cwd(),
        sandboxPolicy: { ...POLICY, allowedExecutables: ["npm"] },
      }
    );
    expect(result.exitCode).toBeNull();
    expect(result.passed).toBe(false);
    expect(result.stderr).toContain("blocked by enforcement policy");
  });

  it("executes an allowed command without inheriting unapproved environment", async () => {
    process.env["SAFE_CHANGE_TEST_SECRET_ENV"] = "should-not-leak";
    try {
      const result = await executeCheck(
        {
          name: "isolated-env",
          executable: process.execPath,
          args: [
            "-e",
            "process.stdout.write(process.env.SAFE_CHANGE_TEST_SECRET_ENV || 'missing')",
          ],
          timeout: 5,
        },
        {
          cwd: process.cwd(),
          sandboxPolicy: {
            ...POLICY,
            allowedExecutables: [process.execPath],
          },
        }
      );
      expect(result.passed).toBe(true);
      expect(result.stdout).toBe("missing");
    } finally {
      delete process.env["SAFE_CHANGE_TEST_SECRET_ENV"];
    }
  });
});