import type { SandboxCapabilities } from "../sandbox/types.js";

export type ReplayDriftCategory =
  | "REPOSITORY_DRIFT"
  | "COMMIT_DRIFT"
  | "CONFIGURATION_DRIFT"
  | "POLICY_DRIFT"
  | "DEPENDENCY_DRIFT"
  | "ENVIRONMENT_DRIFT"
  | "COMMAND_DRIFT"
  | "OUTPUT_DRIFT"
  | "EXIT_STATUS_DRIFT"
  | "ARTIFACT_DRIFT"
  | "SECRET_REDACTION_DRIFT"
  | "SANDBOX_CAPABILITY_DRIFT"
  | "NON_DETERMINISTIC_RESULT";

export interface ReplayCommandSpec {
  readonly name: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly approvedEnvKeys: readonly string[];
  readonly workingDirectory: string;
  readonly order: number;
  readonly timeoutSeconds: number;
  readonly maxOutputBytes: number;
}

export interface ReplayRecordedResult {
  readonly name: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly stdoutDigest: string;
  readonly stderrDigest: string;
  readonly secretRedactionState: {
    readonly outputBlocked: boolean;
    readonly detectedSecretTypes: readonly string[];
  };
  readonly artifactHashes: Record<string, string>;
  readonly durationMs: number;
}

export interface ReplayManifest {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly repositoryHash: string;
  readonly startingCommit: string;
  readonly endingCommit: string;
  readonly workspaceWasClean: boolean;
  readonly baselineId: string;
  readonly policyDigest: string;
  readonly workspaceFingerprint: string;
  readonly lockfileHashes: Record<string, string>;
  readonly safeChangeVersion: string;
  readonly agentProfile: string;
  readonly operatingSystem: string;
  readonly architecture: string;
  /** Missing legacy capability evidence is unverified, not an implicit match. */
  readonly sandboxCapabilities?: SandboxCapabilities | null;
  readonly runtimeVersions: Record<string, string>;
  readonly normalizedCommands: readonly ReplayCommandSpec[];
  readonly recordedResults: readonly ReplayRecordedResult[];
  readonly manifestDigest: string;
  readonly createdAt: string;
}

export interface ReplayMismatch {
  readonly category: ReplayDriftCategory;
  readonly details: string;
  readonly expected?: string;
  readonly actual?: string;
}

export interface ReplayVerificationReport {
  readonly verified: boolean;
  readonly sessionId: string;
  readonly evaluatedAt: string;
  readonly mismatches: readonly ReplayMismatch[];
  readonly replayedResults: readonly ReplayRecordedResult[];
}
