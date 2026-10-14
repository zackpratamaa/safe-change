export type SemanticLanguage =
  | "typescript"
  | "tsx"
  | "javascript"
  | "jsx"
  | "json"
  | "jsonc";

export type SemanticCategory =
  | "source-file-deleted"
  | "negation-inversion"
  | "comparison-change"
  | "logical-operator-change"
  | "assignment-in-condition"
  | "optional-chaining-change"
  | "nullish-coalescing-change"
  | "precedence-change"
  | "branch-condition-change"
  | "guard-inversion"
  | "early-return-change"
  | "return-throw-change"
  | "error-swallowed"
  | "async-await-change"
  | "promise-rejection-removed"
  | "call-target-change"
  | "argument-order-change"
  | "security-sensitive-literal"
  | "exported-api-change"
  | "import-source-change"
  | "assertion-weakening"
  | "test-skip-added"
  | "dynamic-execution-added"
  | "visibility-change"
  | "parser-failure";

export type SemanticSeverity = "critical" | "high" | "medium" | "low";

export type SemanticConfidence = "high" | "medium" | "low";

export interface SourceRange {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface SemanticFinding {
  readonly findingId: string;
  readonly file: string;
  readonly language: SemanticLanguage;
  readonly nodeType: string;
  readonly rangeBefore: SourceRange | null;
  readonly rangeAfter: SourceRange | null;
  readonly category: SemanticCategory;
  readonly severity: SemanticSeverity;
  readonly beforeRepresentation: string;
  readonly afterRepresentation: string;
  readonly confidence: SemanticConfidence;
  readonly explanation: string;
}

export interface SemanticFileDiff {
  readonly file: string;
  readonly language: SemanticLanguage;
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly findings: readonly SemanticFinding[];
  readonly parseError?: string;
}

export interface SemanticDiffSummary {
  readonly totalFindings: number;
  readonly criticalCount: number;
  readonly highCount: number;
  readonly mediumCount: number;
  readonly lowCount: number;
  readonly parseErrors: number;
  readonly hasBlockingFindings: boolean;
}

export interface SemanticDiffReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly baseCommit?: string;
  readonly headCommit?: string;
  readonly files: readonly SemanticFileDiff[];
  readonly summary: SemanticDiffSummary;
  readonly reportDigest: string;
}
