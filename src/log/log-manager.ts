import { realpath, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { LogEntry } from "../types/index.js";
import { readStateFile, writeStateFileAtomically } from "../security/state-files.js";

const LOG_FILE = "log.json";
const DEFAULT_RETENTION = 100;
const mutations = new Map<string, Promise<void>>();

export class LogStorageError extends Error {
  constructor() {
    super("Log history is unreadable, unsafe or corrupt; existing data was preserved. Inspect and back it up before an explicit log clear.");
    this.name = "LogStorageError";
  }
}

export function getLogFilePath(repoRoot: string = process.cwd()): string {
  return join(repoRoot, ".safe-change", LOG_FILE);
}

export function createLogEntry(params: Omit<LogEntry, "id" | "timestamp"> & { id?: string; timestamp?: string }): LogEntry {
  return {
    id: params.id ?? randomUUID(), timestamp: params.timestamp ?? new Date().toISOString(),
    description: params.description ?? null, baselineId: params.baselineId,
    trigger: params.trigger, checkResults: params.checkResults, fileSummary: params.fileSummary,
    regressionDetected: params.regressionDetected, durationMs: params.durationMs ?? null,
  };
}

async function readForMutation(repoRoot: string): Promise<LogEntry[]> {
  try {
    const raw = await readStateFile(repoRoot, LOG_FILE);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some(item => typeof item !== "object" || item === null || Array.isArray(item))) {
      throw new LogStorageError();
    }
    return parsed as LogEntry[];
  } catch { throw new LogStorageError(); }
}

/** Compatibility display API: unreadable history is empty, never a mutation input. */
export async function readEntries(repoRoot: string = process.cwd()): Promise<LogEntry[]> {
  try { return await readForMutation(repoRoot); } catch { return []; }
}

/** Serializes this process only. Separate processes still require single-writer coordination. */
async function mutate(repoRoot: string, operation: (root: string) => Promise<void>): Promise<void> {
  const root = await realpath(resolve(repoRoot));
  const key = process.platform === "win32" ? root.toLowerCase() : root;
  const previous = mutations.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(() => operation(root));
  mutations.set(key, current);
  try { await current; }
  finally { if (mutations.get(key) === current) mutations.delete(key); }
}

function retentionLimit(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_RETENTION;
}

async function writeEntries(repoRoot: string, entries: LogEntry[]): Promise<void> {
  await writeStateFileAtomically(repoRoot, LOG_FILE, JSON.stringify(entries, null, 2) + "\n");
}

export async function appendEntry(entry: LogEntry, repoRoot: string = process.cwd(), retention: number = DEFAULT_RETENTION): Promise<void> {
  await mutate(repoRoot, async root => {
    const entries = await readForMutation(root);
    entries.push(entry);
    const limit = retentionLimit(retention);
    await writeEntries(root, entries.length > limit ? entries.slice(-limit) : entries);
  });
}

export async function pruneToRetention(max: number, repoRoot: string = process.cwd()): Promise<void> {
  if (!Number.isSafeInteger(max) || max <= 0) return;
  await mutate(repoRoot, async root => {
    const entries = await readForMutation(root);
    if (entries.length > max) await writeEntries(root, entries.slice(-max));
  });
}

/** Explicit destructive recovery; never follows a linked state destination. */
export async function clearLog(repoRoot: string = process.cwd()): Promise<void> {
  await mutate(repoRoot, root => writeEntries(root, []));
}

export async function exportLog(outputPath: string, repoRoot: string = process.cwd()): Promise<void> {
  const entries = await readForMutation(repoRoot);
  await writeFile(outputPath, JSON.stringify(entries, null, 2) + "\n", "utf-8");
}

export async function updateLastEntry(updates: Partial<LogEntry>, repoRoot: string = process.cwd()): Promise<void> {
  await mutate(repoRoot, async root => {
    const entries = await readForMutation(root);
    if (entries.length === 0) {
      entries.push(createLogEntry({
        description: updates.description ?? null, baselineId: updates.baselineId ?? "unknown",
        trigger: updates.trigger ?? "cli", checkResults: updates.checkResults ?? [],
        fileSummary: updates.fileSummary ?? { added: 0, modified: 0, deleted: 0, unchanged: 0 },
        regressionDetected: updates.regressionDetected ?? false, durationMs: updates.durationMs ?? null,
      }));
    } else {
      const index = entries.length - 1;
      const current = entries[index]!;
      entries[index] = { ...current, ...updates, checkResults: updates.checkResults ?? current.checkResults, fileSummary: updates.fileSummary ?? current.fileSummary };
    }
    await writeEntries(root, entries);
  });
}
