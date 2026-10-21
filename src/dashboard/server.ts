import { randomBytes } from "node:crypto";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
export { openBrowser } from "./browser.js";
import { loadBaseline } from "../baseline/manager.js";
import { readEntriesStrict } from "../log/log-manager.js";
import { loadConfig } from "../config/loader.js";
import { renderDashboardHtml } from "./template.js";

export const DEFAULT_DASHBOARD_PORT = 4242;
export const LOCALHOST_HOST = "127.0.0.1";

export interface DashboardServerOptions {
  port?: number;
  repoRoot?: string;
}

export interface DashboardServerInstance {
  server: Server;
  port: number;
  host: string;
  url: string;
  close: () => Promise<void>;
}

export async function createDashboardServer(
  options: DashboardServerOptions = {}
): Promise<Server> {
  const repoRoot = options.repoRoot ?? process.cwd();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${LOCALHOST_HOST}`);

    if (req.method !== "GET") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method Not Allowed" }));
      return;
    }

    if (url.pathname === "/") {
      const nonce = randomBytes(16).toString("base64");
      const html = renderDashboardHtml(nonce);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(html),
        "Content-Security-Policy": `default-src 'self'; script-src 'self' 'nonce-${nonce}'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none';`,
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
      });
      res.end(html);
      return;
    }

    if (url.pathname === "/api/status") {
      try {
        const baseline = await loadBaseline(repoRoot);
        const data = baseline
          ? {
              hasBaseline: true,
              createdAt: baseline.createdAt,
              description: baseline.description,
              fileCount: Object.keys(baseline.files).length,
              git: baseline.git,
              checks: baseline.checks,
            }
          : {
              hasBaseline: false,
              createdAt: null,
              description: null,
              fileCount: 0,
              git: null,
              checks: [],
            };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      } catch {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to read baseline status" }));
      }
      return;
    }

    if (url.pathname === "/api/log") {
      try {
        const entries = await readEntriesStrict(repoRoot);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(entries));
      } catch {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to read log entries" }));
      }
      return;
    }

    if (url.pathname === "/api/config") {
      try {
        const config = await loadConfig(repoRoot);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(config));
      } catch {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ exists: false, checks: [] }));
      }
      return;
    }

    if (url.pathname === "/api/rules") {
      try {
        const { loadRulesResult } = await import("../rules/manager.js");
        const rulesState = await loadRulesResult(repoRoot);
        const safeError = rulesState.error ? rulesState.error.replace(repoRoot, ".") : null;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: rulesState.status,
            configured: rulesState.status !== "not-configured",
            rules: rulesState.rules,
            error: safeError,
          })
        );
      } catch {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "invalid",
            configured: true,
            rules: [],
            error: "Failed to read rules configuration",
          })
        );
      }
      return;
    }

    if (url.pathname === "/api/enterprise") {
      try {
        const { getFileEntries, getDiffText } = await import("../git/inspector.js");
        const { compareFiles } = await import("../comparator/engine.js");
        const { DEFAULT_ENTERPRISE_POLICY } = await import("../enterprise/policy.js");
        const { assessChange } = await import("../enterprise/risk-engine.js");

        const config = await loadConfig(repoRoot).catch(() => null);
        const policy = config?.enterprisePolicy ?? DEFAULT_ENTERPRISE_POLICY;
        const baseline = await loadBaseline(repoRoot).catch(() => null);
        const currentFiles = await getFileEntries(repoRoot);
        const diff = await getDiffText(repoRoot);
        const fileChanges = baseline
          ? compareFiles(baseline.files, currentFiles)
          : {
              added: Object.keys(currentFiles),
              modified: [],
              deleted: [],
              unchangedCount: 0,
            };
        const assessment = assessChange({
          files: fileChanges,
          linesAdded: diff.linesAdded,
          linesDeleted: diff.linesRemoved,
          diffText: diff.text,
          policy,
          hasBaseline: baseline !== null,
          configuredCheckNames: config?.checks?.map((c) => c.name) ?? [],
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ policy, assessment, diffStats: { linesAdded: diff.linesAdded, linesRemoved: diff.linesRemoved } }));
      } catch {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to evaluate enterprise risk" }));
      }
      return;
    }

    if (url.pathname === "/api/lease") {
      try {
        const { readWriteLease, isLeaseExpired } = await import("../integrity/lease.js");
        const lease = await readWriteLease(repoRoot);
        const expired = lease ? isLeaseExpired(lease) : true;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ active: lease !== null && !expired, lease, isExpired: expired }));
      } catch {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ active: false, lease: null, isExpired: true }));
      }
      return;
    }

    if (url.pathname === "/api/audit") {
      try {
        const { readAuditEvents, verifyAuditEvents } = await import("../integrity/audit-log.js");
        const events = await readAuditEvents(repoRoot);
        const verified = verifyAuditEvents(events);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ verified, totalEvents: events.length, events: events.slice(-50).reverse() }));
      } catch (err: unknown) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            verified: false,
            corrupted: true,
            error: err instanceof Error ? err.message : "Failed to load audit events",
            totalEvents: 0,
            events: [],
          })
        );
      }
      return;
    }

    if (url.pathname === "/api/identity") {
      try {
        const { loadTrustRegistry } = await import("../identity/registry.js");
        const registry = await loadTrustRegistry(repoRoot);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(registry));
      } catch {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ version: 1, identities: [] }));
      }
      return;
    }

    if (url.pathname === "/api/verifiable") {
      try {
        const { readdir } = await import("node:fs/promises");
        let semanticReport = null;
        try {
          const reportRaw = await readFile(join(repoRoot, ".safe-change", "semantic", "last-report.json"), "utf8");
          semanticReport = JSON.parse(reportRaw);
        } catch {}

        const attestations: Array<{ filename: string; summary?: Record<string, unknown> }> = [];
        try {
          const attestDir = join(repoRoot, ".safe-change", "attestations");
          const files = await readdir(attestDir);
          for (const f of files.filter((f) => f.endsWith(".json")).slice(0, 10)) {
            try {
              const raw = await readFile(join(attestDir, f), "utf8");
              const parsed = JSON.parse(raw) as Record<string, unknown>;
              attestations.push({ filename: f, summary: parsed });
            } catch {}
          }
        } catch {}

        const replays: Array<{ filename: string; sessionId: string; manifestDigest: string; createdAt: string }> = [];
        try {
          const replayDir = join(repoRoot, ".safe-change", "replay");
          const files = await readdir(replayDir);
          for (const f of files.filter((f) => f.endsWith(".json")).slice(0, 10)) {
            try {
              const raw = await readFile(join(replayDir, f), "utf8");
              const parsed = JSON.parse(raw);
              replays.push({
                filename: f,
                sessionId: parsed.sessionId || f,
                manifestDigest: parsed.manifestDigest || "",
                createdAt: parsed.createdAt || "",
              });
            } catch {}
          }
        } catch {}

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ semanticReport, attestations, replays }));
      } catch {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ semanticReport: null, attestations: [], replays: [] }));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  return server;
}

export async function startDashboardServer(
  options: DashboardServerOptions = {}
): Promise<DashboardServerInstance> {
  let initialPort = options.port;
  const isExplicitPort = options.port !== undefined;

  if (initialPort === undefined) {
    const repoRoot = options.repoRoot ?? process.cwd();
    try {
      const config = await loadConfig(repoRoot);
      initialPort = config.dashboardPort ?? DEFAULT_DASHBOARD_PORT;
    } catch {
      initialPort = DEFAULT_DASHBOARD_PORT;
    }
  }

  const maxAttempts = isExplicitPort ? 1 : 10;
  let server: Server | null = null;
  let boundPort = initialPort;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidatePort = initialPort === 0 ? 0 : initialPort + attempt;
    const candidateServer = await createDashboardServer(options);

    const result = await new Promise<{ ok: boolean; err?: Error }>((resolve) => {
      const onError = (err: NodeJS.ErrnoException) => {
        candidateServer.removeListener("listening", onListening);
        if (err.code === "EADDRINUSE" && attempt + 1 < maxAttempts) {
          resolve({ ok: false });
        } else if (err.code === "EADDRINUSE") {
          resolve({
            ok: false,
            err: new Error(
              `Port ${candidatePort} is already in use. Specify a different port using '--port <number>' or configure 'dashboardPort' in .safe-change.json.`
            ),
          });
        } else {
          resolve({ ok: false, err });
        }
      };

      const onListening = () => {
        candidateServer.removeListener("error", onError);
        resolve({ ok: true });
      };

      candidateServer.once("error", onError);
      candidateServer.once("listening", onListening);
      candidateServer.listen(candidatePort, LOCALHOST_HOST);
    });

    if (result.ok) {
      server = candidateServer;
      const addr = server.address() as AddressInfo;
      boundPort = addr.port;
      break;
    }

    try {
      candidateServer.close();
    } catch {
      // ignore
    }

    if (result.err) {
      throw result.err;
    }
  }

  if (!server) {
    throw new Error(`Failed to bind dashboard server after ${maxAttempts} attempts.`);
  }

  const url = `http://${LOCALHOST_HOST}:${boundPort}`;

  return {
    server,
    port: boundPort,
    host: LOCALHOST_HOST,
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
