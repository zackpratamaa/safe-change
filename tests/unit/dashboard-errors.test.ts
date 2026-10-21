import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  startDashboardServer,
  openBrowser,
  type DashboardServerInstance,
} from "../../src/dashboard/server.js";

describe("Dashboard Server Failure Paths & Error Responses", () => {
  let tempDir: string;
  let serverInstance: DashboardServerInstance | null = null;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sc-dash-err-"));
  });

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.close();
      serverInstance = null;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns 404 JSON response for unknown endpoints", async () => {
    serverInstance = await startDashboardServer({
      port: 0,
      repoRoot: tempDir,
    });

    const response = await fetch(`${serverInstance.url}/api/non-existent-endpoint`);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Not Found");
  });

  it("returns safe rules information when rules file is not configured", async () => {
    serverInstance = await startDashboardServer({
      port: 0,
      repoRoot: tempDir,
    });

    const response = await fetch(`${serverInstance.url}/api/rules`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("not-configured");
    expect(body.configured).toBe(false);
    expect(body.rules).toEqual([]);
  });

  it("fails closed instead of returning zero enterprise metrics when Git inspection fails", async () => {
    serverInstance = await startDashboardServer({
      port: 0,
      repoRoot: tempDir,
    });

    const response = await fetch(`${serverInstance.url}/api/enterprise`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Failed to evaluate enterprise risk",
    });
  });

  it("fails to bind when explicit port is already occupied", async () => {
    serverInstance = await startDashboardServer({
      port: 0,
      repoRoot: tempDir,
    });

    const occupiedPort = serverInstance.port;

    await expect(
      startDashboardServer({
        port: occupiedPort,
        repoRoot: tempDir,
      })
    ).rejects.toThrow("already in use");
  });

  it("handles openBrowser without throwing", () => {
    expect(() => openBrowser("http://localhost:4242")).not.toThrow();
  });

  it("includes client-side escapeHtml and security headers preventing XSS", async () => {
    serverInstance = await startDashboardServer({
      port: 0,
      repoRoot: tempDir,
    });

    const res = await fetch(`${serverInstance.url}/`);
    const html = await res.text();
    expect(html).toContain("function escapeHtml(");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
  });
});
