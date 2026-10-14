import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { assertNoSymlinkOrJunction } from "./path-safety.js";
import {
  atomicWriteFileNative,
  lockFileNative,
  unlockFileNative,
} from "../../native/index.js";

export class TransactionError extends Error {
  public readonly code: string;
  public readonly targetDir: string;

  constructor(message: string, code: string, targetDir: string) {
    super(message);
    this.name = "TransactionError";
    this.code = code;
    this.targetDir = targetDir;
  }
}

// Active registry of transactions for graceful signal handling
const activeTransactions = new Set<InstallationTransaction>();
let signalHandlersAttached = false;

function handleTransactionSignal(signal: "SIGINT" | "SIGTERM"): void {
  const transactions = Array.from(activeTransactions);
  for (const tx of transactions) {
    try {
      tx.abort();
    } catch {
      // Best-effort during process exit
    }
  }
  activeTransactions.clear();
  detachTransactionSignalHandlers();

  // Terminate with standard signal semantics without swallowing
  if (process.platform === "win32") {
    process.exit(signal === "SIGINT" ? 130 : 143);
  } else {
    try {
      process.kill(process.pid, signal);
    } catch {
      process.exit(signal === "SIGINT" ? 130 : 143);
    }
  }
}

const onSigInt = () => handleTransactionSignal("SIGINT");
const onSigTerm = () => handleTransactionSignal("SIGTERM");

function attachTransactionSignalHandlers(): void {
  if (signalHandlersAttached) {
    return;
  }
  signalHandlersAttached = true;
  process.on("SIGINT", onSigInt);
  process.on("SIGTERM", onSigTerm);
}

function detachTransactionSignalHandlers(): void {
  if (!signalHandlersAttached) {
    return;
  }
  signalHandlersAttached = false;
  process.removeListener("SIGINT", onSigInt);
  process.removeListener("SIGTERM", onSigTerm);
}

export interface TransactionOptions {
  targetDir: string;
  stagingParentDir?: string;
}

/**
 * Manages an atomic, staged filesystem transaction for installation and update operations.
 * - Writes all candidate files into a private staging directory.
 * - Atomically swaps staging directory into target location.
 * - Automatically registers and cleans up temporary staging files on failure or signals.
 */
export class InstallationTransaction {
  public readonly targetDir: string;
  public readonly stagingDir: string;
  private stagedFiles: Set<string> = new Set();
  private committed = false;
  private aborted = false;
  private lockHandle: number | null = null;
  private lockFilePath: string | null = null;

  constructor(options: TransactionOptions) {
    this.targetDir = path.resolve(options.targetDir);

    // Staging directory should preferably be in the same filesystem/parent to allow atomic rename
    const parentDir = options.stagingParentDir ?? path.dirname(this.targetDir);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Attempt kernel file locking via native module if available on dedicated lock file
    const lockPath = path.join(parentDir, `.lock-${path.basename(this.targetDir)}`);
    const lock = lockFileNative(lockPath);
    if (lock !== null) {
      this.lockHandle = lock;
      this.lockFilePath = lockPath;
    }
    // Fallback: If lockFileNative is unavailable (null), filesystem locking is omitted in pure TypeScript mode.
    // Limitation: Concurrent processes modifying the same target directory must be managed via process orchestration.

    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.stagingDir = path.join(parentDir, `.staging-safe-change-${uniqueId}`);
    fs.mkdirSync(this.stagingDir, { recursive: true });

    activeTransactions.add(this);
    attachTransactionSignalHandlers();
  }

  /**
   * Writes content to a relative path inside the staging directory.
   */
  public stageFile(relativeFilePath: string, content: string | Buffer): string {
    this.ensureActive();

    const normalizedRel = path.normalize(relativeFilePath);
    if (normalizedRel.startsWith("..") || path.isAbsolute(normalizedRel)) {
      throw new TransactionError(
        `Path traversal rejected in staging: '${relativeFilePath}'.`,
        "TRAVERSAL_IN_STAGING",
        this.stagingDir
      );
    }

    const destination = path.join(this.stagingDir, normalizedRel);
    const destDir = path.dirname(destination);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    assertNoSymlinkOrJunction(destination);
    fs.writeFileSync(destination, content);
    this.stagedFiles.add(normalizedRel);
    return destination;
  }

  /**
   * Copies a source file to a relative path inside the staging directory.
   */
  public stageCopy(sourceFilePath: string, relativeFilePath: string): string {
    this.ensureActive();

    const resolvedSource = path.resolve(sourceFilePath);
    if (!fs.existsSync(resolvedSource)) {
      throw new TransactionError(
        `Source file not found for staging: '${resolvedSource}'.`,
        "SOURCE_NOT_FOUND",
        this.stagingDir
      );
    }

    assertNoSymlinkOrJunction(resolvedSource);
    const content = fs.readFileSync(resolvedSource);
    return this.stageFile(relativeFilePath, content);
  }

  /**
   * Returns list of relative paths staged so far.
   */
  public getStagedFiles(): string[] {
    return Array.from(this.stagedFiles);
  }

  /**
   * Atomically commits the staged directory into targetDir.
   */
  public commit(): void {
    this.ensureActive();

    assertNoSymlinkOrJunction(this.targetDir);
    const targetParent = path.dirname(this.targetDir);
    if (!fs.existsSync(targetParent)) {
      fs.mkdirSync(targetParent, { recursive: true });
    }

    let tempBackupDir: string | null = null;

    try {
      // If target exists, move it temporarily aside to allow rename
      if (fs.existsSync(this.targetDir)) {
        const uniqueBackupId = `.backup-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        tempBackupDir = path.join(targetParent, uniqueBackupId);
        fs.renameSync(this.targetDir, tempBackupDir);
      }

      // Rename stagingDir to targetDir (attempt native atomic write first, fallback to fs.renameSync)
      const nativeRenamed = atomicWriteFileNative(this.stagingDir, this.targetDir);
      if (nativeRenamed !== true) {
        fs.renameSync(this.stagingDir, this.targetDir);
      }

      // Verify post-commit state
      if (!fs.existsSync(this.targetDir)) {
        throw new TransactionError(
          `Target directory not found immediately after rename: '${this.targetDir}'.`,
          "VERIFICATION_FAILED",
          this.targetDir
        );
      }

      assertNoSymlinkOrJunction(this.targetDir);

      // Check all staged files exist in targetDir
      for (const rel of this.stagedFiles) {
        const targetFile = path.join(this.targetDir, rel);
        if (!fs.existsSync(targetFile)) {
          throw new TransactionError(
            `Target file missing verification post-commit: '${targetFile}'.`,
            "VERIFICATION_FAILED",
            this.targetDir
          );
        }
      }

      // Commit successful: remove temporary backup directory
      if (tempBackupDir && fs.existsSync(tempBackupDir)) {
        try {
          fs.rmSync(tempBackupDir, { recursive: true, force: true });
        } catch {
          // ignore backup cleanup warning
        }
      }

      this.committed = true;
      activeTransactions.delete(this);
      if (activeTransactions.size === 0) {
        detachTransactionSignalHandlers();
      }
      if (this.lockHandle !== null) {
        unlockFileNative(this.lockHandle);
        this.lockHandle = null;
        if (this.lockFilePath && fs.existsSync(this.lockFilePath)) {
          try {
            fs.unlinkSync(this.lockFilePath);
          } catch {
            // Best-effort cleanup
          }
        }
      }
    } catch (err: any) {
      let recoveryFailure: unknown;
      // Rollback target from tempBackupDir if it was moved aside
      if (tempBackupDir && fs.existsSync(tempBackupDir)) {
        try {
          if (fs.existsSync(this.targetDir)) {
            fs.rmSync(this.targetDir, { recursive: true, force: true });
          }
          fs.renameSync(tempBackupDir, this.targetDir);
        } catch (restoreError) {
          recoveryFailure = restoreError;
        }
      }

      this.abort();
      if (recoveryFailure) throw new AggregateError([err, recoveryFailure], `Commit and rollback both failed. Backup retained at ${tempBackupDir}; manual recovery required.`);
      throw err;
    }
  }

  /**
   * Aborts transaction and cleans up staging directory.
   */
  public abort(): void {
    if (this.aborted || this.committed) {
      return;
    }
    this.aborted = true;

    try {
      if (fs.existsSync(this.stagingDir)) {
        fs.rmSync(this.stagingDir, { recursive: true, force: true });
      }
    } catch {
      // Best-effort cleanup
    } finally {
      activeTransactions.delete(this);
      if (activeTransactions.size === 0) {
        detachTransactionSignalHandlers();
      }
      if (this.lockHandle !== null) {
        unlockFileNative(this.lockHandle);
        this.lockHandle = null;
        if (this.lockFilePath && fs.existsSync(this.lockFilePath)) {
          try {
            fs.unlinkSync(this.lockFilePath);
          } catch {
            // Best-effort cleanup
          }
        }
      }
    }
  }

  private ensureActive(): void {
    if (this.committed) {
      throw new TransactionError(
        "Transaction has already been committed.",
        "TRANSACTION_ALREADY_COMMITTED",
        this.targetDir
      );
    }
    if (this.aborted) {
      throw new TransactionError(
        "Transaction has already been aborted.",
        "TRANSACTION_ALREADY_ABORTED",
        this.targetDir
      );
    }
  }
}
