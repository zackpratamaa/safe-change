#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { OutputFormat } from "./types/index.js";
import { ExitCodes } from "./types/index.js";
import type { InstallerScope } from "./installer/core/path-safety.js";
import { runQuality } from "./commands/quality.js";
import { runSession } from "./commands/session.js";
import { runInit } from "./commands/init.js";
import { runSave } from "./commands/save.js";
import { runCheck } from "./commands/check.js";
import { runDiff } from "./commands/diff.js";
import { runAssess } from "./commands/assess.js";
import { runLease } from "./commands/lease.js";
import { runFingerprint } from "./commands/fingerprint.js";
import { runEvidence } from "./commands/evidence.js";
import { runAudit } from "./commands/audit.js";
import { runAuthorize } from "./commands/authorize.js";
import { runApproval } from "./commands/approval.js";
import { runPolicyVerify } from "./commands/policy.js";
import { runLog } from "./commands/log.js";
import { runInstall } from "./installer/commands/install.js";
import { runUpdate } from "./installer/commands/update.js";
import { runUninstall } from "./installer/commands/uninstall.js";
import { runStatus } from "./installer/commands/status.js";
import { runSemanticDiff } from "./commands/semantic-diff.js";
import { runReplay } from "./commands/replay.js";
import { runAttest } from "./commands/attest.js";
import { runIdentity } from "./commands/identity.js";

// Version

function getVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "..", "package.json"), "utf-8")
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

// Argument parsing

interface ParsedArgs {
  command: string | null;
  positional: string[];
  scope: InstallerScope;
  flags: {
    json: boolean;
    help: boolean;
    version: boolean;
    verbose: boolean;
    overwrite: boolean;
    dryRun: boolean;
    nonInteractive: boolean;
    stat: boolean;
    strict: boolean;
    updateGitignore: boolean;
  };
  logOptions: {
    last?: number;
    all?: boolean;
    exportPath?: string;
    clear?: boolean;
  };
  dashboardOptions: {
    port?: number;
    noOpen?: boolean;
  };
  options: {
    baseCommit?: string;
    file?: string;
    keyId?: string;
    privateKey?: string;
    publicKey?: string;
    reexecute?: boolean;
    failOn?: "critical" | "high" | "medium" | "low";
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // skip node and script path
  const result: ParsedArgs = {
    command: null,
    positional: [],
    scope: "project",
    flags: {
      json: false,
      help: false,
      version: false,
      verbose: false,
      overwrite: false,
      dryRun: false,
      nonInteractive: false,
      stat: false,
      strict: false,
      updateGitignore: false,
    },
    logOptions: {},
    dashboardOptions: {},
    options: {},
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }

    if (arg === "--json") {
      result.flags.json = true;
    } else if (arg === "--help" || arg === "-h") {
      result.flags.help = true;
    } else if (arg === "--version" || arg === "-v") {
      result.flags.version = true;
    } else if (arg === "--verbose") {
      result.flags.verbose = true;
    } else if (arg === "--stat") {
      result.flags.stat = true;
    } else if (arg === "--overwrite") {
      result.flags.overwrite = true;
    } else if (arg === "--update-gitignore") {
      result.flags.updateGitignore = true;
    } else if (arg === "--dry-run") {
      result.flags.dryRun = true;
    } else if (
      arg === "--non-interactive" ||
      arg === "-y" ||
      arg === "--yes"
    ) {
      result.flags.nonInteractive = true;
    } else if (arg === "--global" || arg === "-g") {
      result.scope = "global";
    } else if (arg === "--project" || arg === "-p") {
      result.scope = "project";
    } else if (arg === "--scope") {
      const nextArg = args[i + 1];
      if (nextArg !== undefined && !nextArg.startsWith("-")) {
        i++;
        const nextVal = nextArg.toLowerCase();
        if (nextVal === "global" || nextVal === "project") {
          result.scope = nextVal;
        } else {
          process.stderr.write(`Unknown scope: ${nextArg}\n`);
          process.stderr.write('Valid scopes are "project" or "global".\n');
          process.exit(ExitCodes.CONFIG_ERROR);
        }
      } else {
        process.stderr.write(
          "Option --scope requires an argument (project or global).\n"
        );
        process.exit(ExitCodes.CONFIG_ERROR);
      }
    } else if (arg.startsWith("--scope=")) {
      const nextVal = arg.slice("--scope=".length).toLowerCase();
      if (nextVal === "global" || nextVal === "project") {
        result.scope = nextVal;
      } else {
        process.stderr.write(`Unknown scope: ${nextVal}\n`);
        process.stderr.write('Valid scopes are "project" or "global".\n');
        process.exit(ExitCodes.CONFIG_ERROR);
      }
    } else if (arg === "--last") {
      const nextArg = args[++i];
      if (nextArg !== undefined && /^\d+$/.test(nextArg)) {
        result.logOptions.last = parseInt(nextArg, 10);
      } else {
        process.stderr.write("Option --last requires a positive integer.\\n");
        process.exit(ExitCodes.CONFIG_ERROR);
      }
    } else if (arg.startsWith("--last=")) {
      const val = arg.slice("--last=".length);
      if (/^\d+$/.test(val)) {
        result.logOptions.last = parseInt(val, 10);
      } else {
        process.stderr.write("Option --last requires a positive integer.\\n");
        process.exit(ExitCodes.CONFIG_ERROR);
      }
    } else if (arg === "--all") {
      result.logOptions.all = true;
    } else if (arg === "--clear") {
      result.logOptions.clear = true;
    } else if (arg === "--export") {
      const nextArg = args[++i];
      if (nextArg !== undefined && !nextArg.startsWith("-")) {
        result.logOptions.exportPath = nextArg;
      } else {
        process.stderr.write("Option --export requires a file path.\\n");
        process.exit(ExitCodes.CONFIG_ERROR);
      }
    } else if (arg.startsWith("--export=")) {
      result.logOptions.exportPath = arg.slice("--export=".length);
    } else if (arg === "--port") {
      const nextArg = args[++i];
      if (nextArg !== undefined && /^\d+$/.test(nextArg)) {
        result.dashboardOptions.port = parseInt(nextArg, 10);
      } else {
        process.stderr.write("Option --port requires a valid port number.\\n");
        process.exit(ExitCodes.CONFIG_ERROR);
      }
    } else if (arg.startsWith("--port=")) {
      const val = arg.slice("--port=".length);
      if (/^\d+$/.test(val)) {
        result.dashboardOptions.port = parseInt(val, 10);
      } else {
        process.stderr.write("Option --port requires a valid port number.\\n");
        process.exit(ExitCodes.CONFIG_ERROR);
      }
    } else if (arg === "--no-open") {
      result.dashboardOptions.noOpen = true;
    } else if (arg === "--strict") {
      result.flags.strict = true;
      result.options.reexecute = true; // Backward-compatible replay alias.
    } else if (arg === "--reexecute") {
      result.options.reexecute = true;
    } else if (arg === "--fail-on") {
      const value = args[++i];
      if (!["critical", "high", "medium", "low"].includes(value ?? "")) {
        process.stderr.write(
          "Option --fail-on requires critical, high, medium, or low.\n"
        );
        process.exit(ExitCodes.CONFIG_ERROR);
      }
      result.options.failOn = value as ParsedArgs["options"]["failOn"];
    } else if (arg.startsWith("--fail-on=")) {
      const value = arg.slice("--fail-on=".length);
      if (!["critical", "high", "medium", "low"].includes(value)) {
        process.stderr.write(
          "Option --fail-on requires critical, high, medium, or low.\n"
        );
        process.exit(ExitCodes.CONFIG_ERROR);
      }
      result.options.failOn = value as ParsedArgs["options"]["failOn"];
    } else if (arg === "--base") {
      result.options.baseCommit = args[++i];
    } else if (arg.startsWith("--base=")) {
      result.options.baseCommit = arg.slice("--base=".length);
    } else if (arg === "--file") {
      result.options.file = args[++i];
    } else if (arg.startsWith("--file=")) {
      result.options.file = arg.slice("--file=".length);
    } else if (arg === "--key-id") {
      result.options.keyId = args[++i];
    } else if (arg.startsWith("--key-id=")) {
      result.options.keyId = arg.slice("--key-id=".length);
    } else if (arg === "--private-key") {
      result.options.privateKey = args[++i];
    } else if (arg.startsWith("--private-key=")) {
      result.options.privateKey = arg.slice("--private-key=".length);
    } else if (arg === "--public-key") {
      result.options.publicKey = args[++i];
    } else if (arg.startsWith("--public-key=")) {
      result.options.publicKey = arg.slice("--public-key=".length);
    } else if (arg.startsWith("-")) {
      process.stderr.write(`Unknown flag: ${arg}\n`);
      process.stderr.write('Run "safe-change --help" for usage.\n');
      process.exit(ExitCodes.CONFIG_ERROR);
    } else if (result.command === null) {
      result.command = arg;
    } else {
      result.positional.push(arg);
    }
  }

  return result;
}

// Help text

const HELP_TEXT = `
safe-change -- A safety net for AI-assisted coding.

Usage:
  safe-change init [options]       Auto-detect test runners and create configuration.
  safe-change save [description]   Record a baseline of the repository and verification results.
  safe-change check                Compare current state against the baseline.
  safe-change diff [options]       Show a summary of changes since the baseline.
  safe-change quality <action>     Limited static audit, external-tool profiles, or current-evidence gate.
  safe-change session <action>     Task contract, human choice, observation, watch, and workflow gates.
  safe-change assess               Score risk, enforce change budget, and detect policy downgrades.
  safe-change lease <action>       Acquire, inspect, or release the repository write lease.
  safe-change fingerprint [check]  Capture or compare the workspace fingerprint.
  safe-change evidence <session>   Create a checksummed evidence bundle for a session.
  safe-change audit verify         Verify the tamper-evident local audit log.
  safe-change authorize <capability> <resource> <agent> <session> [approval]
                                  Evaluate one operation through the policy decision point.
  safe-change approval <action>    Request, grant, or inspect an expiring approval.
  safe-change identity <action>    Register, verify, or revoke trusted approver identities.
  safe-change semantic-diff [opt]  Show AST semantic diff against base commit or file.
  safe-change replay <action>      Record, verify, or inspect deterministic replay bundles.
  safe-change attest <action>      Create, verify, or inspect cryptographic DSSE attestations.
  safe-change policy verify        Verify the configured Ed25519 policy signature.
  safe-change log [options]        Show or export persistent safety log.
  safe-change rules [action]       Manage safety rules (list, add, remove, validate).
  safe-change dashboard [options]  Start local web dashboard at localhost:4242.
  safe-change install <agent|all>  Install agent skill (or 'all' for all detected/supported agents).
  safe-change update <agent|all>   Update agent skill with latest canonical version.
  safe-change uninstall <agent|all> Remove agent skill from target directory.
  safe-change status [agent]       Show installation, auto-detection, and drift status.
  safe-change mcp                  Start MCP server (stdio transport).

Supported agents:
  all             Install for all detected agents
  antigravity     Google Antigravity (filesystem-validated)
  claude-code     Anthropic Claude Code (filesystem-validated)
  cursor          Cursor by Anysphere (filesystem-validated)
  codex           OpenAI Codex (filesystem-validated)
  cline           Cline (filesystem-validated)
  kimi-code       Kimi Code by Moonshot AI (filesystem-validated)
  amp             Amp by Sourcegraph (filesystem-validated)
  opencode        OpenCode (filesystem-validated)
  gemini-cli      Google Gemini CLI (filesystem-validated)
  github-copilot  GitHub Copilot (filesystem-validated)

Options:
  --scope <project|global>  Installation scope (default: project).
  --global, -g              Shorthand for --scope global.
  --project, -p             Shorthand for --scope project.
  --stat                    Show working tree line changes in safe-change diff.
  --last <n>                Show n most recent log entries (default: 10).
  --all                     Show all log entries.
  --export <file>           Export full log to a JSON file.
  --clear                   Clear all log entries.
  --port <n>                Override dashboard port (default: 4242).
  --no-open                 Do not open browser automatically.
  --overwrite               Overwrite existing files or confirm destructive action.
  --update-gitignore        Add .safe-change/ to .gitignore during init (disabled by default).
  --dry-run                 Preview without writing to disk.
  --non-interactive, -y     Run without interactive confirmation prompts.
  --strict                  For check, require verified status (exit 1 otherwise).
  --json                    Output in JSON format.
  --help, -h                Show this help message.
  --version, -v             Show version.
  --verbose                 Show additional detail.

Exit codes:
  0  Success / No regressions detected.
  1  At least one previously passing check now fails.
  2  State error / No baseline found.
  3  Configuration error.
  4  Not a Git repository.
  5  Internal error.
  6  Operation cancelled by user.
  7  Collision detected; explicit --overwrite required.
  8  Ownership conflict.
  9  Incompatible target or unsupported agent.

Configuration:
  Create a .safe-change.json file in your project root:

  {
    "version": 1,
    "checks": [
      { "name": "build", "executable": "npm", "args": ["run", "build"], "timeout": 60 },
      { "name": "test", "executable": "npx", "args": ["vitest", "run"], "timeout": 120 }
    ]
  }

Documentation: https://github.com/zackpratamaa/safe-change
`;

// Entry point

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);
  const format: OutputFormat = parsed.flags.json ? "json" : "terminal";

  if (parsed.flags.version) {
    process.stdout.write(`safe-change ${getVersion()}\n`);
    process.exit(ExitCodes.OK);
  }

  if (parsed.flags.help || parsed.command === null) {
    process.stdout.write(HELP_TEXT);
    process.exit(ExitCodes.OK);
  }

  let exitCode: number;

  switch (parsed.command) {
    case "init": {
      exitCode = await runInit({
        format,
        overwrite: parsed.flags.overwrite,
        updateGitignore: parsed.flags.updateGitignore,
      });
      break;
    }

    case "save": {
      const description = parsed.positional.join(" ") || "unnamed baseline";
      exitCode = await runSave({ description, format });
      break;
    }

    case "check": {
      exitCode = await runCheck({ format, strict: parsed.flags.strict });
      break;
    }

    case "diff": {
      exitCode = await runDiff({ format, stat: parsed.flags.stat });
      break;
    }

    case "quality": {
      exitCode = await runQuality({ values: parsed.positional, file: parsed.options.file, format });
      break;
    }

    case "session": {
      exitCode = await runSession({ values: parsed.positional, file: parsed.options.file, format });
      break;
    }

    case "assess": {
      exitCode = await runAssess({ format });
      break;
    }

    case "lease": {
      const action = (parsed.positional[0] ?? "status") as
        | "acquire"
        | "status"
        | "release";
      if (!["acquire", "status", "release"].includes(action)) {
        process.stderr.write(`Unknown lease action: ${action}\n`);
        exitCode = ExitCodes.CONFIG_ERROR;
        break;
      }
      exitCode = await runLease({
        action,
        sessionId: parsed.positional[1],
        agentName: parsed.positional[2],
        format,
      });
      break;
    }

    case "fingerprint": {
      exitCode = await runFingerprint({
        format,
        compare: parsed.positional[0] === "check",
        agentProfile: parsed.positional[1],
      });
      break;
    }

    case "evidence": {
      exitCode = await runEvidence({
        sessionId: parsed.positional[0],
        agentProfile: parsed.positional[1],
        format,
      });
      break;
    }

    case "audit": {
      if ((parsed.positional[0] ?? "verify") !== "verify") {
        process.stderr.write("Only `safe-change audit verify` is supported.\n");
        exitCode = ExitCodes.CONFIG_ERROR;
        break;
      }
      exitCode = await runAudit({ format });
      break;
    }

    case "authorize": {
      exitCode = await runAuthorize({
        capability: parsed.positional[0],
        resource: parsed.positional[1],
        agentName: parsed.positional[2],
        sessionId: parsed.positional[3],
        approvalRequestId: parsed.positional[4],
        format,
      });
      break;
    }

    case "approval": {
      const action = (parsed.positional[0] ?? "status") as
        | "request"
        | "grant"
        | "status"
        | "sign"
        | "verify";
      if (!["request", "grant", "status", "sign", "verify"].includes(action)) {
        process.stderr.write(`Unknown approval action: ${action}\n`);
        exitCode = ExitCodes.CONFIG_ERROR;
        break;
      }
      exitCode = await runApproval({
        action,
        values: parsed.positional.slice(1),
        format,
      });
      break;
    }

    case "identity": {
      const action = (parsed.positional[0] ?? "list") as
        | "keygen"
        | "register"
        | "verify"
        | "revoke"
        | "list";
      if (!["keygen", "register", "verify", "revoke", "list"].includes(action)) {
        process.stderr.write(`Unknown identity action: ${action}\n`);
        exitCode = ExitCodes.CONFIG_ERROR;
        break;
      }
      exitCode = await runIdentity({
        action,
        values: parsed.positional.slice(1),
        format,
      });
      break;
    }

    case "semantic-diff": {
      exitCode = await runSemanticDiff({
        format,
        baseCommit: parsed.options.baseCommit,
        file: parsed.options.file,
        failOn: parsed.options.failOn,
      });
      break;
    }

    case "replay": {
      const action = (parsed.positional[0] ?? "verify") as
        | "record"
        | "verify"
        | "inspect";
      if (!["record", "verify", "inspect"].includes(action)) {
        process.stderr.write(`Unknown replay action: ${action}\n`);
        exitCode = ExitCodes.CONFIG_ERROR;
        break;
      }
      exitCode = await runReplay({
        action,
        target: parsed.positional[1] ?? "",
        format,
        reexecute: parsed.options.reexecute,
      });
      break;
    }

    case "attest": {
      const action = (parsed.positional[0] ?? "verify") as
        | "create"
        | "verify"
        | "inspect";
      if (!["create", "verify", "inspect"].includes(action)) {
        process.stderr.write(`Unknown attest action: ${action}\n`);
        exitCode = ExitCodes.CONFIG_ERROR;
        break;
      }
      exitCode = await runAttest({
        action,
        target: parsed.positional[1] ?? "",
        format,
        keyId: parsed.options.keyId,
        privateKeyPath: parsed.options.privateKey,
        publicKeyPath: parsed.options.publicKey,
      });
      break;
    }

    case "policy": {
      if ((parsed.positional[0] ?? "verify") !== "verify") {
        process.stderr.write("Only `safe-change policy verify` is supported.\n");
        exitCode = ExitCodes.CONFIG_ERROR;
        break;
      }
      exitCode = await runPolicyVerify({ format });
      break;
    }

    case "log": {
      exitCode = await runLog({
        format,
        last: parsed.logOptions.last,
        all: parsed.logOptions.all,
        exportPath: parsed.logOptions.exportPath,
        clear: parsed.logOptions.clear,
        nonInteractive: parsed.flags.nonInteractive,
      });
      break;
    }

    case "dashboard": {
      const { runDashboard } = await import("./commands/dashboard.js");
      exitCode = await runDashboard({
        port: parsed.dashboardOptions.port,
        noOpen: parsed.dashboardOptions.noOpen,
        format,
      });
      break;
    }

    case "rules": {
      const { runRules } = await import("./commands/rules.js");
      const action = (parsed.positional[0] || "list") as "list" | "add" | "remove" | "validate";
      const target = parsed.positional[1];
      exitCode = await runRules({
        action,
        target,
        format,
      });
      break;
    }

    case "install": {
      const agent = parsed.positional[0];
      exitCode = await runInstall({
        agent,
        scope: parsed.scope,
        overwrite: parsed.flags.overwrite,
        dryRun: parsed.flags.dryRun,
        nonInteractive: parsed.flags.nonInteractive,
        format,
      });
      break;
    }

    case "update": {
      const agent = parsed.positional[0];
      exitCode = await runUpdate({
        agent,
        scope: parsed.scope,
        overwrite: parsed.flags.overwrite,
        dryRun: parsed.flags.dryRun,
        nonInteractive: parsed.flags.nonInteractive,
        format,
      });
      break;
    }

    case "uninstall": {
      const agent = parsed.positional[0];
      exitCode = await runUninstall({
        agent,
        scope: parsed.scope,
        overwrite: parsed.flags.overwrite,
        dryRun: parsed.flags.dryRun,
        nonInteractive: parsed.flags.nonInteractive,
        format,
      });
      break;
    }

    case "status": {
      const agent = parsed.positional[0];
      exitCode = await runStatus({
        agent,
        scope: parsed.scope,
        format,
      });
      break;
    }

    case "mcp": {
      // Dynamic import to avoid loading MCP SDK for non-mcp commands
      const { startServer } = await import("./mcp/server.js");
      await startServer();
      // MCP server runs until stdin closes; do not exit
      return;
    }

    default:
      process.stderr.write(`Unknown command: ${parsed.command}\n`);
      process.stderr.write('Run "safe-change --help" for usage.\n');
      exitCode = ExitCodes.CONFIG_ERROR;
  }

  process.exit(exitCode);
}

main().catch((err: unknown) => {
  process.stderr.write(
    `Internal error: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(ExitCodes.INTERNAL_ERROR);
});
