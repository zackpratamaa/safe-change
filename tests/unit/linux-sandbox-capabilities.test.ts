import { describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { LinuxSandboxProvider } from "../../src/sandbox/providers/linux-sandbox.js";
import type { SandboxExecutionSpec } from "../../src/sandbox/types.js";

const spec: SandboxExecutionSpec = {
  executable: "node", args: [], cwd: process.cwd(), timeoutSeconds: 5,
  maxOutputBytes: 4096, allowedEnv: [], inheritEnv: false,
  networkPolicy: "deny", readOnlyWorkspace: true,
};

describe("Linux sandbox runtime capability probe", () => {
  it.each(["ENOENT", "Operation not permitted", "Timed out"])(
    "fails closed on %s even when bubblewrap might be installed", async (message) => {
      const probe = vi.fn().mockRejectedValue(new Error(message));
      const provider = new LinuxSandboxProvider(probe);
      const caps = await provider.detectCapabilities();
      expect(caps.filesystemIsolation).toBe(false);
      expect(caps.networkIsolation).toBe(false);
      expect((await provider.evaluatePolicy(spec)).state).toBe("BLOCKED");
      expect(probe).toHaveBeenCalledTimes(1);
      expect(probe.mock.calls[0]?.[1]).not.toContain("--version");
    },
  );

  it("distinguishes working filesystem isolation from denied network namespaces", async () => {
    const probe = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("network denied"));
    const provider = new LinuxSandboxProvider(probe);
    const caps = await provider.detectCapabilities();
    expect(caps.filesystemIsolation).toBe(true);
    expect(caps.networkIsolation).toBe(false);
    expect((await provider.evaluatePolicy(spec)).state).toBe("BLOCKED");
    expect((await provider.evaluatePolicy({ ...spec, networkPolicy: "inherit" })).state).toBe("DEGRADED");
  });

  it("shares concurrent probes, bounds execution and cleans the temporary home", async () => {
    const probe = vi.fn().mockResolvedValue({});
    const provider = new LinuxSandboxProvider(probe);
    const [first, second] = await Promise.all([provider.detectCapabilities(), provider.detectCapabilities()]);
    expect(first).toBe(second);
    expect(first.networkIsolation).toBe(true);
    expect(first.readOnlyWorkspace).toBe(true);
    expect(probe).toHaveBeenCalledTimes(2);
    const [binary, args, options] = probe.mock.calls[1]!;
    expect(binary).toBe("bwrap");
    expect(args).toEqual(expect.arrayContaining(["--unshare-net", "--unshare-pid", "--ro-bind", "--bind", process.execPath]));
    expect(options).toEqual({ timeout: 5000, maxBuffer: 4096 });
    const home = args[args.indexOf("--setenv") + 2];
    expect(existsSync(home)).toBe(false);
    expect((await provider.evaluatePolicy(spec)).state).toBe("DEGRADED");
  });

  it("rebinds read-only workspaces under /tmp and supplies a writable private home", () => {
    const provider = new LinuxSandboxProvider();
    const command = provider.prepareCommand({ ...spec, cwd: "/tmp/project" }, "node", [], "/tmp/private-home");
    expect(command.args.join(" ")).toContain("--ro-bind /tmp/project /tmp/project");
    expect(command.args.join(" ")).toContain("--bind /tmp/private-home /tmp/private-home");
  });
});
