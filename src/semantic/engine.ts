import { createHash } from "node:crypto";
import type {
  SemanticDiffReport,
  SemanticDiffSummary,
  SemanticFileDiff,
  SemanticFinding,
} from "./types.js";
import type { LanguageSemanticAdapter } from "./adapters/adapter.js";
import { TypeScriptSemanticAdapter } from "./adapters/typescript-adapter.js";
import { JsonSemanticAdapter } from "./adapters/json-adapter.js";

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

export class SemanticDiffEngine {
  private readonly adapters: readonly LanguageSemanticAdapter[];

  constructor(adapters?: readonly LanguageSemanticAdapter[]) {
    this.adapters = adapters ?? [
      new TypeScriptSemanticAdapter(),
      new JsonSemanticAdapter(),
    ];
  }

  getAdapter(filePath: string): LanguageSemanticAdapter | null {
    for (const adapter of this.adapters) {
      if (adapter.supports(filePath)) {
        return adapter;
      }
    }
    return null;
  }

  compareContents(
    filePath: string,
    beforeContent: string,
    afterContent: string
  ): SemanticFileDiff | null {
    const adapter = this.getAdapter(filePath);
    if (!adapter) {
      return null;
    }

    const beforeHash = sha256(beforeContent);
    const afterHash = sha256(afterContent);

    // If exact content matches, no findings
    if (beforeHash === afterHash) {
      return {
        file: filePath,
        language: adapter.getLanguage(filePath),
        beforeHash,
        afterHash,
        findings: [],
      };
    }

    const rawFindings: readonly SemanticFinding[] = beforeContent.trim() && !afterContent.trim()
      ? [{
        findingId: sha256(`${filePath}:source-file-deleted:${beforeHash}`).slice(0, 16),
        file: filePath,
        language: adapter.getLanguage(filePath),
        nodeType: "SourceFile",
        rangeBefore: null,
        rangeAfter: null,
        category: "source-file-deleted",
        severity: "critical",
        beforeRepresentation: "Non-empty supported source file",
        afterRepresentation: "Deleted or emptied source file",
        confidence: "high",
        explanation: "Supported source was removed or emptied; explicit review is required.",
      }]
      : adapter.compare(filePath, beforeContent, afterContent);

    // Deterministic sorting of findings
    const sortedFindings = [...rawFindings].sort((a, b) => {
      const lineA = a.rangeAfter?.startLine ?? a.rangeBefore?.startLine ?? 0;
      const lineB = b.rangeAfter?.startLine ?? b.rangeBefore?.startLine ?? 0;
      if (lineA !== lineB) return lineA - lineB;
      const colA = a.rangeAfter?.startColumn ?? a.rangeBefore?.startColumn ?? 0;
      const colB = b.rangeAfter?.startColumn ?? b.rangeBefore?.startColumn ?? 0;
      if (colA !== colB) return colA - colB;
      return a.findingId.localeCompare(b.findingId);
    });

    const parseError = sortedFindings.find(
      (f) => f.category === "parser-failure"
    )?.afterRepresentation;

    return {
      file: filePath,
      language: adapter.getLanguage(filePath),
      beforeHash,
      afterHash,
      findings: sortedFindings,
      ...(parseError ? { parseError } : {}),
    };
  }

  generateReport(
    fileInputs: readonly {
      filePath: string;
      beforeContent: string;
      afterContent: string;
    }[],
    baseCommit?: string,
    headCommit?: string
  ): SemanticDiffReport {
    const fileDiffs: SemanticFileDiff[] = [];

    for (const input of fileInputs) {
      const diff = this.compareContents(
        input.filePath,
        input.beforeContent,
        input.afterContent
      );
      if (diff) {
        fileDiffs.push(diff);
      }
    }

    // Sort files deterministically by path
    fileDiffs.sort((a, b) => a.file.localeCompare(b.file));

    let totalFindings = 0;
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    let parseErrors = 0;

    for (const file of fileDiffs) {
      totalFindings += file.findings.length;
      for (const finding of file.findings) {
        if (finding.severity === "critical") criticalCount++;
        else if (finding.severity === "high") highCount++;
        else if (finding.severity === "medium") mediumCount++;
        else if (finding.severity === "low") lowCount++;

        if (finding.category === "parser-failure") parseErrors++;
      }
    }

    const summary: SemanticDiffSummary = {
      totalFindings,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      parseErrors,
      hasBlockingFindings: criticalCount > 0,
    };

    const manifestForDigest = {
      schemaVersion: 1,
      baseCommit,
      headCommit,
      files: fileDiffs.map((f) => ({
        file: f.file,
        language: f.language,
        beforeHash: f.beforeHash,
        afterHash: f.afterHash,
        findingIds: f.findings.map((finding) => finding.findingId),
      })),
      summary,
    };

    const reportDigest = sha256(JSON.stringify(manifestForDigest));

    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      ...(baseCommit ? { baseCommit } : {}),
      ...(headCommit ? { headCommit } : {}),
      files: fileDiffs,
      summary,
      reportDigest,
    };
  }
}
