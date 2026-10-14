export type {
  SafeChangeConfig,
  CheckDefinition,
  FileStatus,
  FileEntry,
  GitState,
  CheckResult,
  Baseline,
  CheckComparisonResult,
  CheckComparison,
  ConfigDrift,
  FileChanges,
  CheckReportSummary,
  CheckReport,
  VerificationBinding,
  DiffSummary,
  ExitCode,
  OutputFormat,
  LogEntry,
  LogCheckResult,
  LogFileSummary,
  CheckLogResult,
  CheckLogState,
  SafeChangeRule,
  RuleSeverity,
  RuleCondition,
  RuleConditionType,
  RulesConfigFile,
  RuleViolation,
  RuleEvaluationResult,
  EnterpriseMode,
  ChangeBudget,
  EnterprisePolicy,
  RiskCategory,
  RiskSignal,
  ChangeMetrics,
  BudgetViolation,
  EnterpriseAssessment,
  SecretType,
  SecretFinding,
  WorkspaceFingerprint,
  WorkspaceDriftCategory,
  WorkspaceDrift,
  WriteLease,
  AuditEvent,
  EvidenceManifest,
  Capability,
  AgentCapabilityPolicy,
  CommandSandboxPolicy,
  ApprovalPolicy,
  EnforcementPolicy,
  PolicySignature,
  OperationRequest,
  PolicyDecision,
  ApprovalGrant,
  ApprovalRequest,
} from "./types/index.js";

export { ExitCodes } from "./types/index.js";
export { loadConfig, ConfigError } from "./config/loader.js";
export { loadBaseline, saveBaseline, computeConfigHash, BaselineError } from "./baseline/manager.js";
export { getRepositoryRoot, getGitState, getFileEntries, getDiffText, GitError } from "./git/inspector.js";
export { executeCheck, executeAllChecks } from "./runner/executor.js";
export { compareChecks, compareFiles, buildReport, detectConfigDrift } from "./comparator/engine.js";
export {
  appendEntry,
  readEntries,
  pruneToRetention,
  clearLog,
  exportLog,
  createLogEntry,
  updateLastEntry,
} from "./log/log-manager.js";
export {
  startDashboardServer,
  createDashboardServer,
  openBrowser,
  type DashboardServerOptions,
  type DashboardServerInstance,
} from "./dashboard/server.js";
export {
  BUILT_IN_RULES,
  getBuiltInRule,
  getAllBuiltInRules,
} from "./rules/built-in.js";
export {
  loadRules,
  saveRules,
  addRule,
  removeRule,
  validateRule,
} from "./rules/manager.js";
export {
  matchGlob,
  globToRegex,
  evaluateRules,
} from "./rules/engine.js";
export {
  DEFAULT_CHANGE_BUDGET,
  DEFAULT_ENTERPRISE_POLICY,
  ENTERPRISE_MODES,
  maxMode,
} from "./enterprise/policy.js";
export {
  assessChange,
  evaluateChangeBudget,
  modeForRisk,
  type AssessChangeInput,
} from "./enterprise/risk-engine.js";
export {
  captureWorkspaceFingerprint,
  compareWorkspaceFingerprints,
} from "./integrity/fingerprint.js";
export {
  acquireWriteLease,
  releaseWriteLease,
  readWriteLease,
  isLeaseExpired,
  LeaseConflictError,
} from "./integrity/lease.js";
export {
  appendAuditEvent,
  readAuditEvents,
  verifyAuditEvents,
  AuditLogError,
} from "./integrity/audit-log.js";
export {
  createEvidenceBundle,
  persistVerificationSummary,
  type VerificationSummary,
} from "./integrity/evidence.js";
export {
  redactSecrets,
  StreamingSecretRedactor,
  type RedactionResult,
} from "./security/secret-redactor.js";
export {
  evaluateOperation,
  isCapability,
} from "./enforcement/decision.js";
export {
  createApprovalRequest,
  readApprovalRequest,
  grantApproval,
  verifyApprovalRequest,
} from "./enforcement/approvals.js";
export {
  enforcementPolicyDigest,
  verifyPolicySignature,
  type PolicySignatureVerification,
} from "./enforcement/policy-signature.js";
export {
  evaluateCommandSandbox,
  type SandboxDecision,
} from "./enforcement/sandbox.js";

// Task observation is cooperative; it does not grant authenticated approvals.
export { createSession, loadSession, observeSession, sessionGate, watchSession, monitorHealth, validateContract } from "./session/manager.js";
export type { ChangeContract, TaskSession, GatePoint, GateResult, VerificationChoice } from "./session/manager.js";

export { inspectQualitySource, scanQuality, type QualityFinding, type QualityScan } from './quality/scan.js';
export { qualityGate, validateQualityPolicy, type QualityPolicy, type QualityGate } from './quality/gate.js';
export { QUALITY_PROFILES, qualityProfile, type QualityProfile } from './quality/profiles.js';
export { evaluateQualityReport, type QualityReportVerdict } from './quality/reports.js';
