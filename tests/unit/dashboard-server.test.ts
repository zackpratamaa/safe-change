import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  startDashboardServer,
  type DashboardServerInstance,
} from "../../src/dashboard/server.js";
import { appendEntry, createLogEntry } from "../../src/log/log-manager.js";

describe("Dashboard server", () => {
  let tempDir: string;
  let serverInstance: DashboardServerInstance | null = null;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "safe-change-dash-test-"));
  });

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.close();
      serverInstance = null;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it("can be initialized on a random port (not hardcoded to 4242)", async () => {
    serverInstance = await startDashboardServer({ port: 0, repoRoot: tempDir });
    expect(serverInstance.port).toBeGreaterThan(0);
    expect(serverInstance.port).not.toBe(4242);
  });

  it("GET /api/status returns JSON with correct fields", async () => {
    serverInstance = await startDashboardServer({ port: 0, repoRoot: tempDir });
    const res = await fetch(`${serverInstance.url}/api/status`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const data = await res.json();
    expect(data).toHaveProperty("hasBaseline");
    expect(data).toHaveProperty("createdAt");
    expect(data).toHaveProperty("description");
    expect(data).toHaveProperty("fileCount");
    expect(data).toHaveProperty("git");
    expect(data).toHaveProperty("checks");
  });

  it("GET /api/log returns JSON array", async () => {
    const entry = createLogEntry({
      description: "dash test entry",
      baselineId: "baseline-1",
      trigger: "cli",
      checkResults: [],
      fileSummary: { added: 0, modified: 0, deleted: 0, unchanged: 5 },
      regressionDetected: false,
      durationMs: 50,
    });
    await appendEntry(entry, tempDir);

    serverInstance = await startDashboardServer({ port: 0, repoRoot: tempDir });
    const res = await fetch(`${serverInstance.url}/api/log`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].description).toBe("dash test entry");
  });

  it("GET /api/config returns configuration JSON", async () => {
    const configContent = {
      version: 1,
      checks: [
        { name: "lint", executable: "npm", args: ["run", "lint"], timeout: 30 },
      ],
    };
    await writeFile(
      join(tempDir, ".safe-change.json"),
      JSON.stringify(configContent),
      "utf-8"
    );

    serverInstance = await startDashboardServer({ port: 0, repoRoot: tempDir });
    const res = await fetch(`${serverInstance.url}/api/config`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.version).toBe(1);
    expect(data.checks).toHaveLength(1);
    expect(data.checks[0].name).toBe("lint");
  });

  it("GET / returns HTML with Content-Type text/html", async () => {
    serverInstance = await startDashboardServer({ port: 0, repoRoot: tempDir });
    const res = await fetch(`${serverInstance.url}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");

    const text = await res.text();
    expect(text).toContain("safe-change dashboard");
    expect(text).toContain("Panel 1");
    expect(text).toContain("Panel 2");
    expect(text).toContain("Panel 3");
    expect(text).toContain("Panel 4");
  });

  it("binds only to 127.0.0.1", async () => {
    serverInstance = await startDashboardServer({ port: 0, repoRoot: tempDir });
    expect(serverInstance.host).toBe("127.0.0.1");

    const address = serverInstance.server.address();
    expect(typeof address).toBe("object");
    expect((address as { address: string }).address).toBe("127.0.0.1");
  });

  it("responds with 404 for unknown route", async () => {
    serverInstance = await startDashboardServer({ port: 0, repoRoot: tempDir });
    const res = await fetch(`${serverInstance.url}/unknown-endpoint`);
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error).toBe("Not Found");
  });

  it("can be stopped and port is properly released", async () => {
    serverInstance = await startDashboardServer({ port: 0, repoRoot: tempDir });
    const assignedPort = serverInstance.port;
    const testUrl = serverInstance.url;

    const ping1 = await fetch(`${testUrl}/`);
    expect(ping1.status).toBe(200);

    await serverInstance.close();
    serverInstance = null;

    await expect(fetch(`${testUrl}/`)).rejects.toThrow();

    const secondInstance = await startDashboardServer({
      port: assignedPort,
      repoRoot: tempDir,
    });
    expect(secondInstance.port).toBe(assignedPort);
    await secondInstance.close();
  });

  it("GET /api/enterprise returns enterprise assessment and policy", async () => {
    serverInstance = await startDashboardServer({ port: 0, repoRoot: tempDir });
    const res = await fetch(`${serverInstance.url}/api/enterprise`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("policy");
    expect(data).toHaveProperty("assessment");
    expect(data.assessment).toHaveProperty("riskScore");
    expect(data.assessment).toHaveProperty("requiredMode");
  });

  it("GET /api/lease returns lease status", async () => {
    serverInstance = await startDashboardServer({ port: 0, repoRoot: tempDir });
    const res = await fetch(`${serverInstance.url}/api/lease`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("active");
    expect(data).toHaveProperty("isExpired");
  });

  it("GET /api/audit returns audit hash chain verification", async () => {
    serverInstance = await startDashboardServer({ port: 0, repoRoot: tempDir });
    const res = await fetch(`${serverInstance.url}/api/audit`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("verified");
    expect(data).toHaveProperty("totalEvents");
    expect(Array.isArray(data.events)).toBe(true);
  });

  it("GET /api/audit returns verified: false and corrupted: true when audit log is malformed", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const auditDir = path.join(tempDir, ".safe-change");
    await fs.mkdir(auditDir, { recursive: true });
    await fs.writeFile(path.join(auditDir, "events.jsonl"), "corrupt-non-json-line\n");

    serverInstance = await startDashboardServer({ port: 0, repoRoot: tempDir });
    const res = await fetch(`${serverInstance.url}/api/audit`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.verified).toBe(false);
    expect(data.corrupted).toBe(true);
    expect(data.totalEvents).toBe(0);
    expect(data.error).toContain("invalid JSON");
  });

  it("GET /api/identity returns trust registry identities", async () => {
    serverInstance = await startDashboardServer({ port: 0, repoRoot: tempDir });
    const res = await fetch(`${serverInstance.url}/api/identity`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("version");
    expect(Array.isArray(data.identities)).toBe(true);
  });

  it("GET /api/verifiable returns verifiable attestations and replay info", async () => {
    serverInstance = await startDashboardServer({ port: 0, repoRoot: tempDir });
    const res = await fetch(`${serverInstance.url}/api/verifiable`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("semanticReport");
    expect(Array.isArray(data.attestations)).toBe(true);
    expect(Array.isArray(data.replays)).toBe(true);
  });
});
