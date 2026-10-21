import {
  readStateFile,
  writeStateFileAtomically,
} from "../security/state-files.js";
import type { AuditEvent } from "../types/index.js";
import { withStateLock } from "../security/state-lock.js";
import { stableDigest } from "./hash.js";

const EVENT_FILE = "events.jsonl";

export class AuditLogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditLogError";
  }
}

export async function readAuditEvents(repoRoot: string): Promise<AuditEvent[]> {
  let content: string;
  try {
    const stored = await readStateFile(repoRoot, EVENT_FILE);
    if (stored === null) return [];
    content = stored;
  } catch (error: unknown) {
    throw new AuditLogError(`Failed to read audit log: ${String(error)}`);
  }
  const events: AuditEvent[] = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line) continue;
    try {
      events.push(JSON.parse(line) as AuditEvent);
    } catch {
      throw new AuditLogError(`Audit log line ${index + 1} is invalid JSON.`);
    }
  }
  return events;
}

function isAuditEvent(value: unknown): value is AuditEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  const digest = (input: unknown): input is string =>
    typeof input === "string" && /^sha256:[a-f0-9]{64}$/.test(input);
  return event["schemaVersion"] === 1 &&
    Number.isSafeInteger(event["sequence"]) && Number(event["sequence"]) > 0 &&
    typeof event["timestamp"] === "string" && Number.isFinite(Date.parse(event["timestamp"])) &&
    typeof event["type"] === "string" && event["type"].length > 0 &&
    (event["sessionId"] === null || typeof event["sessionId"] === "string") &&
    digest(event["payloadDigest"]) && digest(event["eventDigest"]) &&
    (event["previousDigest"] === null || digest(event["previousDigest"]));
}

export function verifyAuditEvents(events: readonly unknown[]): boolean {
  let previousDigest: string | null = null;
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    if (!isAuditEvent(event)) return false;
    if (event.sequence !== index + 1 || event.previousDigest !== previousDigest) {
      return false;
    }
    const unsigned = {
      schemaVersion: event.schemaVersion,
      sequence: event.sequence,
      timestamp: event.timestamp,
      type: event.type,
      sessionId: event.sessionId,
      payloadDigest: event.payloadDigest,
      previousDigest: event.previousDigest,
    };
    if (stableDigest(unsigned) !== event.eventDigest) return false;
    previousDigest = event.eventDigest;
  }
  return true;
}

export async function appendAuditEvent(
  repoRoot: string,
  type: string,
  sessionId: string | null,
  payload: unknown
): Promise<AuditEvent> {
  return withStateLock(repoRoot, "audit-write.lock", async () => {
    // Re-read and verify only after acquiring exclusive ownership. Computing the
    // sequence or previous digest outside this lock permits two writers to
    // create individually valid events that corrupt the chain when appended.
    const events = await readAuditEvents(repoRoot);
    if (!verifyAuditEvents(events)) {
      throw new AuditLogError("Audit log integrity verification failed.");
    }
    const previousDigest = events.at(-1)?.eventDigest ?? null;
    const unsigned = {
      schemaVersion: 1 as const,
      sequence: events.length + 1,
      timestamp: new Date().toISOString(),
      type,
      sessionId,
      payloadDigest: stableDigest(payload),
      previousDigest,
    };
    const event: AuditEvent = {
      ...unsigned,
      eventDigest: stableDigest(unsigned),
    };
    const content = `${[...events, event]
      .map(existing => JSON.stringify(existing))
      .join("\n")}\n`;
    await writeStateFileAtomically(repoRoot, EVENT_FILE, content);
    return event;
  });
}