import { lstat, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CheckDefinition, OutputFormat, SafeChangeConfig } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { getRepositoryRoot } from "../git/inspector.js";
import { isStateIgnored } from "../git/state-ignore.js";
import { renderError } from "../output/renderer.js";

export interface InitOptions {
  readonly format?: OutputFormat;
  readonly overwrite?: boolean;
  readonly updateGitignore?: boolean;
}

export interface AutoDetectedChecks {
  readonly ecosystem: string;
  readonly checks: CheckDefinition[];
}

export async function detectProjectChecks(repoRoot: string): Promise<AutoDetectedChecks> {
  // 1. Node.js (package.json)
  const pkgPath = join(repoRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const raw = await readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(raw);
      const scripts = typeof pkg.scripts === "object" && pkg.scripts !== null ? pkg.scripts : {};
      const checks: CheckDefinition[] = [];

      if (typeof scripts.test === "string" && !scripts.test.includes("no test specified")) {
        checks.push({
          name: "test",
          executable: "npm",
          args: ["test"],
          timeout: 120,
        });
      }

      if (typeof scripts.build === "string") {
        checks.push({
          name: "build",
          executable: "npm",
          args: ["run", "build"],
          timeout: 60,
        });
      }

      if (typeof scripts.lint === "string") {
        checks.push({
          name: "lint",
          executable: "npm",
          args: ["run", "lint"],
          timeout: 45,
        });
      }

      if (checks.length > 0) {
        return { ecosystem: "Node.js / npm", checks };
      }
    } catch {
      // ignore parse error, continue detection
    }
  }

  // 2. Rust (Cargo.toml)
  const cargoPath = join(repoRoot, "Cargo.toml");
  if (existsSync(cargoPath)) {
    return {
      ecosystem: "Rust / Cargo",
      checks: [
        { name: "test", executable: "cargo", args: ["test"], timeout: 180 },
        { name: "check", executable: "cargo", args: ["check"], timeout: 60 },
      ],
    };
  }

  // 3. Go (go.mod)
  const goModPath = join(repoRoot, "go.mod");
  if (existsSync(goModPath)) {
    return {
      ecosystem: "Go",
      checks: [
        { name: "test", executable: "go", args: ["test", "./..."], timeout: 120 },
      ],
    };
  }

  // 4. Python (pyproject.toml, pytest.ini, requirements.txt)
  if (
    existsSync(join(repoRoot, "pyproject.toml")) ||
    existsSync(join(repoRoot, "pytest.ini")) ||
    existsSync(join(repoRoot, "requirements.txt"))
  ) {
    return {
      ecosystem: "Python",
      checks: [
        { name: "test", executable: "pytest", args: [], timeout: 120 },
      ],
    };
  }

  return { ecosystem: "Generic (file guardrails only)", checks: [] };
}

export async function runInit(options: InitOptions = {}): Promise<number> {
  const format = options.format ?? "terminal";

  let repoRoot: string;
  try {
    repoRoot = await getRepositoryRoot(process.cwd());
  } catch {
    process.stderr.write(
      renderError(
        format,
        "Not a Git repository. safe-change requires a Git repository.",
        ExitCodes.NOT_GIT_REPO
      )
    );
    return ExitCodes.NOT_GIT_REPO;
  }

  const configPath = join(repoRoot, ".safe-change.json");
  // Refuse known links/non-files before any overwrite; these checks are not race-proof confinement.
  for (const name of [".safe-change.json", ...(options.updateGitignore ? [".gitignore"] : [])]) {
    try {
      const info = await lstat(join(repoRoot, name));
      if (!info.isFile() || info.isSymbolicLink()) throw new Error("Refusing non-regular or linked init input");
      if (name === ".gitignore") await readFile(join(repoRoot, name), "utf8");
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        process.stderr.write(renderError(format, "Cannot safely access init configuration or gitignore; no overwrite attempted.", ExitCodes.CONFIG_ERROR));
        return ExitCodes.CONFIG_ERROR;
      }
    }
  }
  if (existsSync(configPath) && !options.overwrite) {
    const msg = "Configuration file .safe-change.json already exists. Use --overwrite to regenerate.";
    process.stderr.write(renderError(format, msg, ExitCodes.COLLISION_DETECTED));
    return ExitCodes.COLLISION_DETECTED;
  }

  const detected = await detectProjectChecks(repoRoot);

  const config: SafeChangeConfig = {
    version: 1,
    logRetention: 100,
    checks: detected.checks,
  };

  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

  // Handle .gitignore: Never silently modify by default. Only update if --update-gitignore is explicitly passed.
  const gitignorePath = join(repoRoot, ".gitignore");
  let gitignoreModified = false;
  let gitignoreStatus: "already-ignored" | "not-ignored" | "updated" = "not-ignored";
  const recommendedEntry = ".safe-change/";

  let existingGitignore: string | null = null;
  if (existsSync(gitignorePath)) {
    try {
      existingGitignore = await readFile(gitignorePath, "utf-8");
    } catch {
      if (options.updateGitignore) {
        process.stderr.write(renderError(format, "Cannot read existing gitignore; refusing to replace unknown content.", ExitCodes.CONFIG_ERROR));
        return ExitCodes.CONFIG_ERROR;
      }
    }
  }

  try {
    if (await isStateIgnored(repoRoot)) gitignoreStatus = "already-ignored";
  } catch {
    // Never claim exclusion when Git cannot confirm it. The recommendation remains.
  }

  if (options.updateGitignore) {
    if (gitignoreStatus !== "already-ignored") {
      try {
        if (existingGitignore !== null) {
          const isCrlf = existingGitignore.includes("\r\n");
          const newline = isCrlf ? "\r\n" : "\n";
          const needsLeadingNewline = !existingGitignore.endsWith("\n") && !existingGitignore.endsWith("\r");
          const prefix = needsLeadingNewline ? newline : "";
          await writeFile(gitignorePath, `${existingGitignore}${prefix}${recommendedEntry}${newline}`, "utf-8");
        } else {
          await writeFile(gitignorePath, `${recommendedEntry}\n`, "utf-8");
        }
        gitignoreModified = true;
        gitignoreStatus = "updated";
      } catch {
        // Non-fatal if gitignore write fails
      }
    }
  }

  if (format === "json") {
    process.stdout.write(
      JSON.stringify(
        {
          success: true,
          ecosystem: detected.ecosystem,
          configPath,
          checks: detected.checks,
          gitignoreModified,
          gitignoreStatus,
          gitignoreUpdated: gitignoreModified,
          recommendedEntry,
        },
        null,
        2
      ) + "\n"
    );
  } else {
    process.stdout.write("\nsafe-change initialized successfully!\n\n");
    process.stdout.write(`  Ecosystem:   ${detected.ecosystem}\n`);
    process.stdout.write(`  Config:      .safe-change.json (${detected.checks.length} check(s) configured)\n`);
    for (const c of detected.checks) {
      process.stdout.write(`    - ${c.name}: ${c.executable} ${c.args.join(" ")} (timeout: ${c.timeout}s)\n`);
    }
    if (detected.checks.length === 0) {
      process.stdout.write("    (No automated test runner detected; safe-change will track file changes)\n");
    }
    if (gitignoreStatus === "updated") {
      process.stdout.write("  Gitignore:   Added .safe-change/ to .gitignore\n");
    } else if (gitignoreStatus === "already-ignored") {
      process.stdout.write("  Gitignore:   .safe-change/ is already excluded by Git ignore rules\n");
    } else {
      process.stdout.write("  Gitignore:   Unchanged. Recommendation: add '.safe-change/' to .gitignore\n");
    }
    process.stdout.write("\nNext step: Run 'safe-change save \"initial baseline\"' before editing code.\n\n");
  }

  return ExitCodes.OK;
}
