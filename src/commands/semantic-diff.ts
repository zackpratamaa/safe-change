import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { OutputFormat } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { getRepositoryRoot } from "../git/inspector.js";
import { SemanticDiffEngine } from "../semantic/engine.js";
import { resolveWithinRoot } from "../security/path-boundary.js";
import type { SemanticSeverity } from "../semantic/types.js";

const execFileAsync = promisify(execFile);

export interface SemanticDiffOptions {
  readonly format: OutputFormat;
  readonly baseCommit?: string;
  readonly file?: string;
  readonly failOn?: SemanticSeverity;
}

async function getGitFileContent(
  repoRoot: string,
  commit: string,
  relPath: string
): Promise<string | null> {
  try {
    const gitPath = relPath.replace(/\\/g, "/");
    const { stdout } = await execFileAsync("git", ["show", `${commit}:${gitPath}`], {
      cwd: repoRoot,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

async function getGitModifiedFiles(
  repoRoot: string,
  baseCommit: string
): Promise<readonly string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--name-only", "-z", "--diff-filter=ACMRD", baseCommit],
      { cwd: repoRoot }
    );
    return stdout
      .split("\0")
      .filter((s) => s.length > 0);
  } catch (error: unknown) {
    throw new Error(`Semantic diff Git inspection failed: ${String(error)}`);
  }
}

export async function runSemanticDiff(
  options: SemanticDiffOptions
): Promise<number> {
  const repoRoot = await getRepositoryRoot(process.cwd()).catch(() => null);
  if (!repoRoot) return ExitCodes.NOT_GIT_REPO;

  const engine = new SemanticDiffEngine();
  const baseCommit = options.baseCommit ?? "HEAD";
  // Do not turn an invalid comparison base into an empty successful report.
  await execFileAsync("git", ["rev-parse", "--verify", `${baseCommit}^{commit}`], { cwd: repoRoot });

  let targetFiles: string[] = [];
  if (options.file) {
    const absPath = resolveWithinRoot(
      repoRoot,
      resolve(process.cwd(), options.file),
      "Semantic diff file"
    );
    const rel = relative(repoRoot, absPath).replace(/\\/g, "/");
    targetFiles = [rel];
  } else {
    targetFiles = [...(await getGitModifiedFiles(repoRoot, baseCommit))];
  }

  const fileInputs: Array<{
    filePath: string;
    beforeContent: string;
    afterContent: string;
  }> = [];

  for (const relFile of targetFiles) {
    if (!engine.getAdapter(relFile)) continue;
    const originalContent = await getGitFileContent(repoRoot, baseCommit, relFile);
    const beforeContent = originalContent ?? "";
    let afterContent = "";
    try {
      afterContent = await readFile(resolve(repoRoot, relFile), "utf-8");
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || originalContent === null) {
        throw new Error(`Unable to inspect semantic input "${relFile}": ${String(error)}`);
      }
      // Missing tracked source is a deletion, not an omitted input.
      afterContent = "";
    }
    fileInputs.push({
      filePath: relFile,
      beforeContent,
      afterContent,
    });
  }

  const report = engine.generateReport(fileInputs, baseCommit);
  const reportDirectory = resolve(repoRoot, ".safe-change", "semantic");
  await mkdir(reportDirectory, { recursive: true, mode: 0o700 });
  await writeFile(
    resolveWithinRoot(
      reportDirectory,
      "last-report.json",
      "Semantic report path"
    ),
    `${JSON.stringify(report, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 }
  );

  if (options.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`Safe-Change AST Semantic Diff Report\n`);
    process.stdout.write(`Base: ${baseCommit} | Files evaluated: ${report.files.length}\n`);
    process.stdout.write(
      `Findings: ${report.summary.totalFindings} (Critical: ${report.summary.criticalCount}, High: ${report.summary.highCount}, Medium: ${report.summary.mediumCount}, Low: ${report.summary.lowCount})\n\n`
    );

    for (const file of report.files) {
      if (file.findings.length === 0) continue;
      process.stdout.write(`File: ${file.file} [${file.language}]\n`);
      for (const finding of file.findings) {
        const line =
          finding.rangeAfter?.startLine ?? finding.rangeBefore?.startLine ?? 1;
        process.stdout.write(
          `  Line ${line} [${finding.severity.toUpperCase()}] ${finding.category}: ${finding.explanation}\n`
        );
      }
      process.stdout.write("\n");
    }

    if (report.summary.hasBlockingFindings) {
      process.stdout.write(
        `FAIL: ${report.summary.criticalCount} critical semantic finding(s) detected.\n`
      );
    } else {
      process.stdout.write(`SUCCESS: No critical semantic findings detected.\n`);
    }
  }

  const severityRank: Record<SemanticSeverity, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  const threshold = options.failOn ?? "critical";
  const blocks = report.files.some((file) =>
    file.findings.some(
      (finding) => severityRank[finding.severity] >= severityRank[threshold]
    )
  );
  return blocks ? ExitCodes.NEW_FAILURE : ExitCodes.OK;
}
