import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LinuxSandboxProvider } from "../../src/sandbox/providers/linux-sandbox.js";
import type { SandboxExecutionSpec } from "../../src/sandbox/types.js";

const execFileAsync = promisify(execFile);

// Ordinary hosts may lack namespaces. The dedicated CI job MUST run these tests.
describe.runIf(process.env["SAFE_CHANGE_REQUIRE_LIVE_SANDBOX"] === "1")("required live Linux isolation", () => {
  it("enforces a separate network namespace, read-only workspace and writable home", async () => {
    expect(process.platform).toBe("linux");
    const provider = new LinuxSandboxProvider();
    const caps = await provider.detectCapabilities();
    expect(caps.networkIsolation, "Real bubblewrap runtime probe must pass on this runner").toBe(true);
    expect(caps.readOnlyWorkspace).toBe(true);
    const root = await mkdtemp(join(tmpdir(), "sc-live-workspace-"));
    const home = await mkdtemp(join(tmpdir(), "sc-live-home-"));
    try {
      await writeFile(join(root, "original.txt"), "unchanged");
      const script = [
        "const fs = require('node:fs');",
        "fs.writeFileSync(process.env.HOME + '/home-check', 'writable');",
        "let denied = false;",
        "try { fs.writeFileSync('original.txt', 'changed'); } catch (error) { if (error.code === 'EROFS' || error.code === 'EACCES') denied = true; else throw error; }",
        "if (!denied) process.exit(9);",
        "process.stdout.write(fs.readlinkSync('/proc/self/ns/net'));",
      ].join("\n");
      const spec: SandboxExecutionSpec = {
        executable: process.execPath, args: ["-e", script], cwd: root,
        timeoutSeconds: 10, maxOutputBytes: 4096, allowedEnv: ["PATH"],
        inheritEnv: false, networkPolicy: "deny", readOnlyWorkspace: true,
      };
      const command = provider.prepareCommand(spec, spec.executable, spec.args, home);
      const result = await execFileAsync(command.executable, [...command.args], {
        cwd: root, env: provider.prepareEnvironment(spec, home), timeout: 10000, maxBuffer: 4096,
      });
      expect(result.stdout).not.toBe(await readlink("/proc/self/ns/net"));
      expect(await readFile(join(root, "original.txt"), "utf8")).toBe("unchanged");
      expect(await readFile(join(home, "home-check"), "utf8")).toBe("writable");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
  });
});
