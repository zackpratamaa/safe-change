import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { detectProjectChecks, runInit } from "../../src/commands/init.js";
import { ExitCodes } from "../../src/types/index.js";

const execFileAsync = promisify(execFile);

describe("init command", () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sc-init-test-"));
    await execFileAsync("git", ["init"], { cwd: tempDir });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("auto-detects npm test, build, and lint from package.json", async () => {
    const pkg = {
      name: "demo",
      scripts: {
        test: "vitest run",
        build: "tsc",
        lint: "eslint .",
      },
    };
    await writeFile(join(tempDir, "package.json"), JSON.stringify(pkg));

    const detected = await detectProjectChecks(tempDir);
    expect(detected.ecosystem).toContain("Node.js");
    expect(detected.checks).toHaveLength(3);
    expect(detected.checks[0]?.name).toBe("test");
    expect(detected.checks[1]?.name).toBe("build");
    expect(detected.checks[2]?.name).toBe("lint");
  });

  it("auto-detects Rust project from Cargo.toml", async () => {
    await writeFile(join(tempDir, "Cargo.toml"), '[package]\nname = "demo"\n');

    const detected = await detectProjectChecks(tempDir);
    expect(detected.ecosystem).toContain("Rust");
    expect(detected.checks.map((c) => c.name)).toEqual(["test", "check"]);
  });

  it("creates .safe-change.json and leaves .gitignore untouched by default", async () => {
    const pkg = {
      name: "demo",
      scripts: { test: "jest" },
    };
    await writeFile(join(tempDir, "package.json"), JSON.stringify(pkg));
    await writeFile(join(tempDir, ".gitignore"), "node_modules/\n");

    process.chdir(tempDir);
    const code = await runInit({ format: "json" });
    expect(code).toBe(ExitCodes.OK);

    const configRaw = await readFile(join(tempDir, ".safe-change.json"), "utf-8");
    const config = JSON.parse(configRaw);
    expect(config.version).toBe(1);
    expect(config.checks).toHaveLength(1);
    expect(config.checks[0].name).toBe("test");

    const gitignoreContent = await readFile(join(tempDir, ".gitignore"), "utf-8");
    expect(gitignoreContent).toBe("node_modules/\n");
    expect(gitignoreContent).not.toContain(".safe-change/");
  });

  it("updates .gitignore when --update-gitignore is explicitly provided", async () => {
    await writeFile(join(tempDir, ".gitignore"), "node_modules/\n");

    process.chdir(tempDir);
    const code = await runInit({ format: "json", updateGitignore: true });
    expect(code).toBe(ExitCodes.OK);

    const gitignoreContent = await readFile(join(tempDir, ".gitignore"), "utf-8");
    expect(gitignoreContent).toContain(".safe-change/");
    expect(gitignoreContent).toContain("node_modules/");
  });

  it("ensures --update-gitignore is idempotent and does not create duplicate entries", async () => {
    await writeFile(join(tempDir, ".gitignore"), "node_modules/\n.safe-change/\n");

    process.chdir(tempDir);
    const code = await runInit({ format: "json", overwrite: true, updateGitignore: true });
    expect(code).toBe(ExitCodes.OK);

    const gitignoreContent = await readFile(join(tempDir, ".gitignore"), "utf-8");
    const matches = gitignoreContent.match(/\.safe-change\//g);
    expect(matches).toHaveLength(1);
  });

  it("preserves CRLF line endings when updating .gitignore", async () => {
    await writeFile(join(tempDir, ".gitignore"), "node_modules/\r\ndist/\r\n");

    process.chdir(tempDir);
    const code = await runInit({ format: "json", overwrite: true, updateGitignore: true });
    expect(code).toBe(ExitCodes.OK);

    const gitignoreContent = await readFile(join(tempDir, ".gitignore"), "utf-8");
    expect(gitignoreContent).toContain("\r\n");
    expect(gitignoreContent).toContain(".safe-change/\r\n");
    expect(gitignoreContent.includes("\n") && !gitignoreContent.includes("\r\n")).toBe(false);
  });

  it("preserves LF line endings when updating .gitignore", async () => {
    await writeFile(join(tempDir, ".gitignore"), "node_modules/\ndist/\n");

    process.chdir(tempDir);
    const code = await runInit({ format: "json", overwrite: true, updateGitignore: true });
    expect(code).toBe(ExitCodes.OK);

    const gitignoreContent = await readFile(join(tempDir, ".gitignore"), "utf-8");
    expect(gitignoreContent).not.toContain("\r");
    expect(gitignoreContent).toContain(".safe-change/\n");
  });

  it("aborts with COLLISION_DETECTED if .safe-change.json exists without overwrite", async () => {
    await writeFile(join(tempDir, ".safe-change.json"), "{}");

    process.chdir(tempDir);
    const code = await runInit({ format: "json" });
    expect(code).toBe(ExitCodes.COLLISION_DETECTED);
  });

  it("succeeds when overwrite is true", async () => {
    await writeFile(join(tempDir, ".safe-change.json"), "{}");

    process.chdir(tempDir);
    const code = await runInit({ format: "json", overwrite: true });
    expect(code).toBe(ExitCodes.OK);
  });
  it("refuses non-regular gitignore before modifying configuration", async () => {
    await mkdir(join(tempDir, ".gitignore"));process.chdir(tempDir);
    expect(await runInit({format:"json",updateGitignore:true})).toBe(ExitCodes.CONFIG_ERROR);
    await expect(readFile(join(tempDir,".safe-change.json"))).rejects.toThrow();
  });
  it("refuses linked overwrite targets and preserves their contents", async () => {
    if(process.platform === "win32") return; // File symlinks require privileges; junctions are covered elsewhere.
    await writeFile(join(tempDir,"outside.json"),"original");
    await symlink(join(tempDir,"outside.json"),join(tempDir,".safe-change.json"));process.chdir(tempDir);
    expect(await runInit({format:"json",overwrite:true})).toBe(ExitCodes.CONFIG_ERROR);
    expect(await readFile(join(tempDir,"outside.json"),"utf8")).toBe("original");
  });

});
