import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, ConfigError } from "../../src/config/loader.js";

describe("config/loader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sc-config-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should load a valid configuration", async () => {
    const config = {
      version: 1,
      checks: [
        { name: "build", executable: "npm", args: ["run", "build"], timeout: 60 },
        { name: "test", executable: "npx", args: ["vitest", "run"], timeout: 120 },
      ],
    };
    await writeFile(join(tempDir, ".safe-change.json"), JSON.stringify(config));

    const result = await loadConfig(tempDir);
    expect(result.version).toBe(1);
    expect(result.checks).toHaveLength(2);
    expect(result.checks[0]!.name).toBe("build");
    expect(result.checks[0]!.executable).toBe("npm");
    expect(result.checks[0]!.args).toEqual(["run", "build"]);
    expect(result.checks[0]!.timeout).toBe(60);
  });

  it("should use default timeout when not specified", async () => {
    const config = {
      version: 1,
      checks: [
        { name: "build", executable: "npm", args: ["run", "build"] },
      ],
    };
    await writeFile(join(tempDir, ".safe-change.json"), JSON.stringify(config));

    const result = await loadConfig(tempDir);
    expect(result.checks[0]!.timeout).toBe(60);
  });

  it("should throw ConfigError for missing file", async () => {
    await expect(loadConfig(tempDir)).rejects.toThrow(ConfigError);
  });

  it("should throw ConfigError for invalid JSON", async () => {
    await writeFile(join(tempDir, ".safe-change.json"), "not json {{{");
    await expect(loadConfig(tempDir)).rejects.toThrow(ConfigError);
  });

  it("should throw ConfigError for unsupported version", async () => {
    await writeFile(
      join(tempDir, ".safe-change.json"),
      JSON.stringify({ version: 99, checks: [] })
    );
    await expect(loadConfig(tempDir)).rejects.toThrow(ConfigError);
  });

  it("should throw ConfigError for duplicate check names", async () => {
    const config = {
      version: 1,
      checks: [
        { name: "build", executable: "npm", args: ["run", "build"] },
        { name: "build", executable: "npm", args: ["run", "lint"] },
      ],
    };
    await writeFile(join(tempDir, ".safe-change.json"), JSON.stringify(config));
    await expect(loadConfig(tempDir)).rejects.toThrow(/Duplicate check name/);
  });

  it("should throw ConfigError for missing executable", async () => {
    const config = {
      version: 1,
      checks: [{ name: "build", args: ["run", "build"] }],
    };
    await writeFile(join(tempDir, ".safe-change.json"), JSON.stringify(config));
    await expect(loadConfig(tempDir)).rejects.toThrow(/executable/);
  });

  it("should throw ConfigError for non-array args", async () => {
    const config = {
      version: 1,
      checks: [{ name: "build", executable: "npm", args: "run build" }],
    };
    await writeFile(join(tempDir, ".safe-change.json"), JSON.stringify(config));
    await expect(loadConfig(tempDir)).rejects.toThrow(/args must be an array/);
  });

  it("should throw ConfigError for timeout exceeding maximum", async () => {
    const config = {
      version: 1,
      checks: [
        { name: "slow", executable: "node", args: ["-e", ""], timeout: 9999 },
      ],
    };
    await writeFile(join(tempDir, ".safe-change.json"), JSON.stringify(config));
    await expect(loadConfig(tempDir)).rejects.toThrow(/exceeds maximum/);
  });

  it("loads the project active configuration with requireSignedApprovals: true", async () => {
    const projectRoot = process.cwd();
    const config = await loadConfig(projectRoot);
    expect(config.enforcementPolicy).toBeDefined();
    expect(config.enforcementPolicy?.approvals.requireSignedApprovals).toBe(true);
    expect(config.enterprisePolicy?.minimumMode).toBe("high-assurance");
  });

  it("preserves explicit requireSignedApprovals: false or omitted in loaded config", async () => {
    const configOmitted = {
      version: 1,
      checks: [{ name: "build", executable: "npm", args: ["run", "build"] }],
      enforcementPolicy: {
        policyVersion: 1,
        defaultDecision: "deny",
        requireSignedPolicy: false,
        agents: [],
        commandSandbox: {
          allowedExecutables: ["node"],
          deniedArguments: [],
          allowedEnvironment: [],
          inheritEnvironment: false,
          networkPolicy: "inherit",
          maxOutputBytes: 1024,
        },
        approvals: {
          thresholds: { "release:publish": 1 },
          prohibitSelfApproval: true,
          maximumExceptionTtlSeconds: 3600,
        },
      },
    };
    await writeFile(join(tempDir, ".safe-change.json"), JSON.stringify(configOmitted));
    const resultOmitted = await loadConfig(tempDir);
    expect(resultOmitted.enforcementPolicy?.approvals.requireSignedApprovals).toBeUndefined();

    const configExplicitFalse = {
      ...configOmitted,
      enforcementPolicy: {
        ...configOmitted.enforcementPolicy,
        approvals: {
          ...configOmitted.enforcementPolicy.approvals,
          requireSignedApprovals: false,
        },
      },
    };
    await writeFile(join(tempDir, ".safe-change.json"), JSON.stringify(configExplicitFalse));
    const resultFalse = await loadConfig(tempDir);
    expect(resultFalse.enforcementPolicy?.approvals.requireSignedApprovals).toBe(false);
  });
});
