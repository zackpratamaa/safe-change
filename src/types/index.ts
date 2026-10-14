export interface CheckDefinition {
  readonly name: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly timeout: number; // seconds
}

export interface SafeChangeConfig {
  readonly version: number;
  readonly checks: readonly CheckDefinition[];
  readonly protectedVerificationPaths?: readonly string[];
  readonly logRetention?: number;
  readonly dashboardPort?: number;
  readonly enterprisePolicy?: EnterprisePolicy;
  readonly enforcementPolicy?: EnforcementPolicy;
  readonly policySignature?: PolicySignature;
}

export type EnterpriseMode =
  "standard" | "enhanced" | "high-assurance" | "critical-change";

export interface ChangeBudget {
  readonly maxFilesChanged: number;
  readonly maxLinesAdded: number;
  readonly maxLinesDeleted: number;
  readonly maxPublicApisChanged: number;
  readonly maxDeletedFiles: number;
  readonly allowLockfileChanges: boolean;
}

export interface EnterprisePolicy {
  readonly policyVersion: 1;
  readonly minimumMode: EnterpriseMode;
  readonly requireBaseline: boolean;
  readonly requireTests: boolean;
  readonly requireCoverage: boolean;
  readonly requireDependencyAudit: boolean;
  readonly requireDiffReview: boolean;
  readonly allowForcePush: false;
  readonly allowDestructiveGit: false;
  readonly changeBudget: ChangeBudget;
}

export type Capability =
  | "repository:read"
  | "source:write"
  | "tests:execute"
  | "dependency:modify"
  | "ci:modify"
  | "git:commit"
  | "git:push"
  | "release:publish"
  | "policy:modify"
  | "secret:read";

export interface AgentCapabilityPolicy {
  readonly agent: string;
  readonly allow: readonly Capability[];
  readonly deny: readonly Capability[];
  readonly resourcePatterns: readonly string[];
  readonly expiresAt: string | null;
}

export interface CommandSandboxPolicy {
  readonly allowedExecutables: readonly string[];
  readonly deniedArguments: readonly string[];
  readonly allowedEnvironment: readonly string[];
  readonly inheritEnvironment: boolean;
  readonly networkPolicy: "inherit" | "deny";
  readonly maxOutputBytes: number;
}

export interface ApprovalPolicy {
  readonly thresholds: Readonly<Partial<Record<Capability, number>>>;
  readonly prohibitSelfApproval: boolean;
  readonly requireSignedApprovals?: boolean;
  readonly maximumExceptionTtlSeconds: number;
}

export interface EnforcementPolicy {
  readonly policyVersion: 1;
  readonly defaultDecision: "deny";
  readonly requireSignedPolicy: boolean;
  readonly agents: readonly AgentCapabilityPolicy[];
  readonly commandSandbox: CommandSandboxPolicy;
  readonly approvals: ApprovalPolicy;
}

export interface PolicySignature {
  readonly algorithm: "ed25519";
  readonly keyId: string;
  readonly publicKeyPem: string;
  readonly policyDigest: string;
  readonly signatureBase64: string;
}

export interface OperationRequest {
  readonly sessionId: string;
  readonly agentName: string;
  readonly capability: Capability;
  readonly resource: string;
  readonly approvalRequestId?: string;
}

export interface PolicyDecision {
  readonly decision: "allow" | "deny" | "require-approval";
  readonly reasons: readonly string[];
  readonly capability: Capability;
  readonly resource: string;
  readonly policyDigest: string;
  readonly approvalRequestId: string | null;
}

export interface ApprovalGrant {
  readonly approver: string;
  readonly grantedAt: string;
  readonly previousDigest: string | null;
  readonly grantDigest: string;
}

export interface ApprovalRequest {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly capability: Capability;
  readonly resource: string;
  readonly requester: string;
  readonly sessionId: string;
  readonly reason: string;
  readonly requestedAt: string;
  readonly expiresAt: string;
  readonly requestDigest: string;
  readonly grants: readonly ApprovalGrant[];
  readonly signedGrants?: readonly import("../identity/types.js").SignedApprovalGrant[];
}

export type RiskCategory =
  | "documentation"
  | "test"
  | "source"
  | "dependency"
  | "ci"
  | "file-deletion"
  | "authentication"
  | "migration"
  | "release"
  | "guardrail-downgrade";

export interface RiskSignal {
  readonly category: RiskCategory;
  readonly score: number;
  readonly paths: readonly string[];
  readonly reason: string;
}

export interface ChangeMetrics {
  readonly filesChanged: number;
  readonly filesDeleted: number;
  readonly linesAdded: number;
  readonly linesDeleted: number;
  readonly publicApisChanged: number;
  readonly lockfilesChanged: readonly string[];
}

export interface BudgetViolation {
  readonly field: keyof ChangeBudget;
  readonly actual: number | boolean;
  readonly allowed: number | boolean;
  readonly message: string;
}

export interface EnterpriseAssessment {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly riskScore: number;
  readonly automaticMode: EnterpriseMode;
  readonly requiredMode: EnterpriseMode;
  readonly signals: readonly RiskSignal[];
  readonly metrics: ChangeMetrics;
  readonly budgetPassed: boolean;
  readonly budgetViolations: readonly BudgetViolation[];
  readonly policyBlockers: readonly string[];
  readonly approvalRequired: boolean;
  readonly verificationState: "not-verified";
  readonly evidenceLimitations: readonly string[];
}

// Safety log

export type CheckLogResult =
  | "pass-pass"
  | "pass-fail"
  | "fail-fail"
  | "fail-pass"
  | "pass-timeout"
  | "fail-timeout"
  | "timeout-pass"
  | "timeout-fail"
  | "timeout-timeout"
  | "config-removed"
  | "config-added"
  | "unverified"
  | "definition-changed";

export type CheckLogState = "pass" | "fail" | "timeout" | "unverified";

export interface LogCheckResult {
  readonly name: string;
  readonly result: CheckLogResult;
  readonly before: CheckLogState;
  readonly now: CheckLogState;
}

export interface LogFileSummary {
  readonly added: number;
  readonly modified: number;
  readonly deleted: number;
  readonly unchanged: number;
}

export interface LogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly description: string | null;
  readonly baselineId: string;
  readonly trigger: "manual" | "mcp" | "cli";
  readonly checkResults: readonly LogCheckResult[];
  readonly fileSummary: LogFileSummary;
  readonly regressionDetected: boolean;
  readonly durationMs: number | null;
}

// Git state

export type FileStatus =
  "clean" | "modified" | "staged" | "untracked" | "deleted";

export interface FileEntry {
  readonly tracked: boolean;
  readonly status: FileStatus;
  readonly worktreeHash: string | null; // sha256 hex, null if deleted
  readonly indexHash: string | null; // sha256 hex, null if untracked or deleted from index
}

export interface GitState {
  readonly repositoryRoot: string;
  readonly headCommit: string | null;
  readonly headBranch: string | null;
  readonly isClean: boolean;
}

// Check execution result

export interface CheckResult {
  readonly name: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly timeout: number;
  readonly exitCode: number | null; // null if killed/timeout before exit
  readonly passed: boolean;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly outputBytes: number;
  readonly outputTruncated: boolean;
  readonly stdout: string; // bounded capture for diagnostic display
  readonly stderr: string; // bounded capture for diagnostic display
  readonly outputBlocked?: boolean;
  readonly detectedSecretTypes?: readonly SecretType[];
}

// Baseline

export interface Baseline {
  readonly schemaVersion: 2;
  readonly createdAt: string; // ISO-8601
  readonly description: string;
  readonly git: GitState;
  readonly files: Readonly<Record<string, FileEntry>>;
  readonly excludedPaths: readonly string[];
  readonly checks: readonly CheckResult[];
  readonly checksConfigHash: string;
  readonly workspaceFingerprint?: WorkspaceFingerprint;
}

export type SecretType =
  | "github-token"
  | "npm-token"
  | "private-key"
  | "aws-access-key"
  | "authorization-header"
  | "connection-string"
  | "generic-secret";

export interface SecretFinding {
  readonly type: SecretType;
  readonly start: number;
  readonly end: number;
}

export interface WorkspaceFingerprint {
  readonly schemaVersion: 1;
  readonly capturedAt: string;
  readonly digest: string;
  readonly git: {
    readonly headCommit: string | null;
    readonly headBranch: string | null;
    readonly remoteHash: string | null;
  };
  readonly configurationHash: string;
  readonly rulesHash: string | null;
  readonly lockfiles: Readonly<Record<string, string>>;
  readonly policyVersion: number | null;
  readonly skillHash: string | null;
  readonly agentProfile: string | null;
  readonly runtime: {
    readonly nodeVersion: string;
    readonly platform: NodeJS.Platform;
    readonly architecture: string;
  };
}

export type WorkspaceDriftCategory =
  | "HEAD_DRIFT"
  | "BRANCH_DRIFT"
  | "REMOTE_DRIFT"
  | "CONFIGURATION_DRIFT"
  | "RULES_DRIFT"
  | "DEPENDENCY_DRIFT"
  | "POLICY_DRIFT"
  | "SKILL_DRIFT"
  | "AGENT_PROFILE_DRIFT"
  | "ENVIRONMENT_DRIFT";

export interface WorkspaceDrift {
  readonly detected: boolean;
  readonly categories: readonly WorkspaceDriftCategory[];
  readonly expectedDigest: string;
  readonly currentDigest: string;
}

export interface WriteLease {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly agentName: string;
  readonly baselineId: string | null;
  readonly startingHead: string | null;
  readonly workspaceFingerprint: string;
  readonly leaseStartedAt: string;
  readonly leaseExpiresAt: string;
  readonly processId: number;
}

export interface AuditEvent {
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly timestamp: string;
  readonly type: string;
  readonly sessionId: string | null;
  readonly payloadDigest: string;
  readonly previousDigest: string | null;
  readonly eventDigest: string;
}

export interface EvidenceManifest {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly createdAt: string;
  readonly repositoryHash: string;
  readonly baselineId: string;
  readonly workspaceFingerprint: string;
  readonly verificationState: VerificationState;
  readonly verificationFreshness?: "fresh" | "stale" | "missing";
  readonly files: readonly string[];
  readonly evidenceDigest: string;
}

// Comparison results

export type CheckComparisonResult =
  | "pass-pass"
  | "pass-fail"
  | "pass-timeout"
  | "fail-pass"
  | "fail-fail"
  | "fail-timeout"
  | "timeout-pass"
  | "timeout-fail"
  | "timeout-timeout"
  | "config-removed"
  | "config-added"
  | "definition-changed";

export interface CheckComparison {
  readonly name: string;
  readonly before: "pass" | "fail" | "timeout" | null;
  readonly now: "pass" | "fail" | "timeout" | null;
  readonly result: CheckComparisonResult;
  readonly durationMs: number | null;
  readonly timedOut: boolean;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number | null;
  readonly outputBlocked?: boolean;
  readonly detectedSecretTypes?: readonly SecretType[];
}

export interface ConfigDrift {
  readonly detected: boolean;
  readonly removedChecks: readonly string[];
  readonly addedChecks: readonly string[];
  readonly changedChecks: readonly string[];
  readonly message: string;
}

export interface FileChanges {
  readonly added: readonly string[];
  readonly modified: readonly string[];
  readonly deleted: readonly string[];
  readonly unchangedCount: number;
}

export interface CheckReportSummary {
  readonly newFailures: number;
  readonly fixed: number;
  readonly stillFailing: number;
  readonly stillPassing: number;
  readonly configDrift: boolean;
  readonly definitionChanged: number;
}

export interface BranchMismatch {
  readonly baselineBranch: string;
  readonly currentBranch: string;
}

export type VerificationState =
  "verified" | "failed" | "not-verified" | "unavailable";

export interface VerificationInfo {
  readonly state: VerificationState;
  readonly reason: string;
  readonly configuredChecksCount: number;
  readonly executedChecksCount: number;
  readonly activeRulesCount: number;
}

export interface VerificationBinding {
  readonly schemaVersion: 1;
  readonly sourceDigest: string;
  readonly baselineDigest: string;
  readonly environmentDigest: string;
}

export interface CheckReport {
  readonly verificationBinding?: VerificationBinding;
  readonly verificationInputDrift?: readonly string[];
  readonly inputMutationDetected?: boolean;
  readonly schemaVersion: 2;
  readonly generatedAt: string;
  readonly baseline: {
    readonly createdAt: string;
    readonly description: string;
  };
  readonly configDrift: ConfigDrift;
  readonly results: readonly CheckComparison[];
  readonly files: FileChanges;
  readonly summary: CheckReportSummary;
  readonly exitCode: number;
  readonly ruleViolations?: readonly RuleViolation[];
  readonly branchMismatch?: BranchMismatch | null;
  readonly verification?: VerificationInfo;
  readonly rulesState?: RulesState;
  readonly workspaceDrift?: WorkspaceDrift;
}

// Safety rules

export type RuleSeverity = "error" | "warn";

export type RuleConditionType =
  | "file-not-deleted"
  | "file-not-modified"
  | "max-files-changed"
  | "max-deleted-files"
  | "require-check-pass"
  | "protect-lockfiles";

export interface RuleCondition {
  readonly type: RuleConditionType;
  readonly pattern?: string;
  readonly patterns?: readonly string[];
  readonly threshold?: number;
  readonly checkName?: string;
  readonly exactMatch?: boolean;
}

export interface SafeChangeRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly severity: RuleSeverity;
  readonly condition: RuleCondition;
  readonly builtIn?: boolean;
}

export type RulesLoadStatus =
  "not-configured" | "loaded" | "empty" | "invalid" | "evaluation-error";

export interface RulesState {
  readonly status: RulesLoadStatus;
  readonly rules: readonly SafeChangeRule[];
  readonly error?: string;
}

export interface RulesConfigFile {
  readonly version: 1;
  readonly rules: readonly SafeChangeRule[];
}

export interface RuleViolation {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly severity: RuleSeverity;
  readonly message: string;
  readonly details?: readonly string[];
}

export interface RuleEvaluationResult {
  readonly passed: boolean;
  readonly violations: readonly RuleViolation[];
  readonly errorCount: number;
  readonly warningCount: number;
}

// Diff output

export interface DiffLineStats {
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly statText?: string;
}

export interface DiffSummary {
  readonly files: FileChanges;
  readonly hasBaseline: boolean;
  readonly lineDiffAvailable: boolean;
  readonly note: string;
  readonly lineStats?: DiffLineStats;
}

// Exit codes

export const ExitCodes = {
  OK: 0,
  NEW_FAILURE: 1,
  NO_BASELINE: 2,
  CONFIG_ERROR: 3,
  NOT_GIT_REPO: 4,
  INTERNAL_ERROR: 5,
  OPERATION_CANCELLED: 6,
  COLLISION_DETECTED: 7,
  OWNERSHIP_CONFLICT: 8,
  INCOMPATIBLE_TARGET: 9,
} as const;

export type ExitCode = (typeof ExitCodes)[keyof typeof ExitCodes];

// Output format

export type OutputFormat = "terminal" | "json";
