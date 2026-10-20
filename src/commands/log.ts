import { createInterface } from "node:readline/promises";
import type { OutputFormat, LogEntry } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { getRepositoryRoot } from "../git/inspector.js";
import { renderError } from "../output/renderer.js";
import {
  readEntriesStrict,
  clearLog,
  exportLog,
} from "../log/log-manager.js";

export interface LogCommandOptions {
  readonly format: OutputFormat;
  readonly last?: number;
  readonly all?: boolean;
  readonly exportPath?: string;
  readonly clear?: boolean;
  readonly nonInteractive?: boolean;
}

function formatChecksSummary(results: readonly LogEntry["checkResults"][number][]): string {
  if (results.length === 0) return "none";
  const passed = results.filter((r) => r.result === "pass-pass" || r.result === "fail-pass").length;
  const failed = results.filter((r) => r.result === "pass-fail" || r.result === "fail-fail").length;
  if (failed === 0) return `${passed} passed`;
  return `${passed} passed, ${failed} failed`;
}

function renderLogText(entries: readonly LogEntry[]): string {
  const lines: string[] = [];
  for (const entry of entries) {
    const shortId = entry.id.slice(0, 8);
    const desc = entry.description || "(no description)";
    const checks = formatChecksSummary(entry.checkResults);
    const files = `+${entry.fileSummary.added} ~${entry.fileSummary.modified} -${entry.fileSummary.deleted}`;
    const status = entry.regressionDetected ? "REGRESSION DETECTED" : "CLEAN";

    lines.push(`[${entry.timestamp}] ${shortId} | ${desc}`);
    lines.push(`  Checks: ${checks} | Files: ${files}`);
    lines.push(`  Status: ${status}`);
    lines.push("");
  }
  return lines.join("\n");
}

export async function runLog(options: LogCommandOptions): Promise<number> {
  const { format, last, all, exportPath, clear, nonInteractive } = options;

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

  if (clear) {
    if (!nonInteractive && process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = await rl.question("Clear all log entries? (y/N) ");
        if (!/^y(?:es)?$/i.test(answer.trim())) {
          process.stdout.write("Operation cancelled.\n");
          return ExitCodes.OPERATION_CANCELLED;
        }
      } finally {
        rl.close();
      }
    }
    try { await clearLog(repoRoot); }
    catch (error: unknown) {
      process.stderr.write(renderError(format, `Failed to clear log: ${error instanceof Error ? error.message : String(error)}`, ExitCodes.INTERNAL_ERROR));
      return ExitCodes.INTERNAL_ERROR;
    }
    if (format === "json") {
      process.stdout.write(JSON.stringify({ cleared: true }, null, 2) + "\n");
    } else {
      process.stdout.write("Log cleared.\n");
    }
    return ExitCodes.OK;
  }

  if (exportPath) {
    try {
      await exportLog(exportPath, repoRoot);
      if (format === "json") {
        process.stdout.write(JSON.stringify({ exported: exportPath }, null, 2) + "\n");
      } else {
        process.stdout.write(`Log exported to ${exportPath}\n`);
      }
      return ExitCodes.OK;
    } catch (err: unknown) {
      process.stderr.write(
        renderError(
          format,
          `Failed to export log: ${err instanceof Error ? err.message : String(err)}`,
          ExitCodes.INTERNAL_ERROR
        )
      );
      return ExitCodes.INTERNAL_ERROR;
    }
  }

  let entries: LogEntry[];
  try { entries = await readEntriesStrict(repoRoot); }
  catch (error: unknown) {
    process.stderr.write(renderError(format, `Failed to read log: ${error instanceof Error ? error.message : String(error)}`, ExitCodes.INTERNAL_ERROR));
    return ExitCodes.INTERNAL_ERROR;
  }

  if (entries.length === 0) {
    if (format === "json") {
      process.stdout.write(JSON.stringify([], null, 2) + "\n");
    } else {
      process.stdout.write("No log entries found.\n");
    }
    return ExitCodes.OK;
  }

  let displayed = entries;
  if (!all) {
    const count = typeof last === "number" && last > 0 ? last : 10;
    displayed = entries.slice(-count);
  }

  if (format === "json") {
    process.stdout.write(JSON.stringify(displayed, null, 2) + "\n");
  } else {
    process.stdout.write(renderLogText(displayed));
  }

  return ExitCodes.OK;
}
