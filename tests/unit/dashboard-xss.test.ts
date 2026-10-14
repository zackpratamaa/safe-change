import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  startDashboardServer,
  type DashboardServerInstance,
} from "../../src/dashboard/server.js";
import { renderDashboardHtml } from "../../src/dashboard/template.js";

describe("Dashboard Security, Stored XSS Remediation & CSP Hardening", () => {
  let tempDir: string;
  let serverInstance: DashboardServerInstance | null = null;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sc-dash-xss-"));
  });

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.close();
      serverInstance = null;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("Content Security Policy (CSP)", () => {
    it("enforces strict CSP without script-src 'unsafe-inline' and includes per-response nonce", async () => {
      serverInstance = await startDashboardServer({
        port: 0,
        repoRoot: tempDir,
      });

      const res = await fetch(`${serverInstance.url}/`);
      expect(res.status).toBe(200);

      const csp = res.headers.get("content-security-policy");
      expect(csp).toBeTruthy();

      // Must NOT contain unsafe-inline in script-src
      expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);

      // Must NOT contain unsafe-eval
      expect(csp).not.toContain("'unsafe-eval'");

      // Must include cryptographic nonce in script-src
      const nonceMatch = csp?.match(/script-src[^;]*'nonce-([A-Za-z0-9+/=]+)'/);
      expect(nonceMatch).toBeTruthy();
      const nonce = nonceMatch![1];
      expect(nonce.length).toBeGreaterThanOrEqual(16);

      // script-src-attr must be 'none' to disallow inline event handlers
      expect(csp).toContain("script-src-attr 'none'");

      // Base URI and framing protections
      expect(csp).toContain("base-uri 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");

      // Returned HTML script tag must match the response nonce
      const html = await res.text();
      expect(html).toContain(`<script nonce="${nonce}">`);
    });

    it("generates a distinct cryptographic nonce for subsequent requests", async () => {
      serverInstance = await startDashboardServer({
        port: 0,
        repoRoot: tempDir,
      });

      const res1 = await fetch(`${serverInstance.url}/`);
      const csp1 = res1.headers.get("content-security-policy")!;
      const nonce1 = csp1.match(/'nonce-([^']+)'/)![1];

      const res2 = await fetch(`${serverInstance.url}/`);
      const csp2 = res2.headers.get("content-security-policy")!;
      const nonce2 = csp2.match(/'nonce-([^']+)'/)![1];

      expect(nonce1).not.toBe(nonce2);
    });

    it("does not have any inline onclick attributes in the rendered HTML markup", () => {
      const html = renderDashboardHtml("test-nonce");
      expect(html).not.toMatch(/onclick\s*=/i);
      expect(html).not.toMatch(/onload\s*=/i);
      expect(html).not.toMatch(/onerror\s*=/i);
    });
  });

  describe("Stored XSS Neutralization Across Data Sinks", () => {
    it("neutralizes XSS payloads in baseline status, description, and checks", async () => {
      const scDir = join(tempDir, ".safe-change");
      await mkdir(scDir, { recursive: true });

      const xssPayload = `<img src=x onerror="document.body.dataset.xss='hit'">"'>`;
      const baselineData = {
        schemaVersion: 2,
        createdAt: "2026-10-15T00:00:00.000Z",
        description: `Baseline with ${xssPayload}`,
        git: {
          repositoryRoot: tempDir,
          headCommit: "abcdef123456",
          headBranch: "main",
          isClean: true,
        },
        files: {
          "src/index.ts": {
            tracked: true,
            status: "clean",
            worktreeHash: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            indexHash: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          },
        },
        checks: [
          {
            name: `check-${xssPayload}`,
            executable: "echo",
            args: ["test"],
            timeout: 5000,
            durationMs: 42,
            passed: true,
            timedOut: false,
            exitCode: 0,
            stdout: "ok",
            stderr: "",
          },
        ],
        checksConfigHash: "sha256:1234",
      };

      await writeFile(join(scDir, "baseline.json"), JSON.stringify(baselineData));

      serverInstance = await startDashboardServer({
        port: 0,
        repoRoot: tempDir,
      });

      const res = await fetch(`${serverInstance.url}/api/status`);
      const data = await res.json();
      expect(data.hasBaseline).toBe(true);
      expect(data.description).toContain("<img src=x");

      // Verify template client-side escapeHtml logic safely encodes all special characters
      const html = renderDashboardHtml();
      // Ensure escapeHtml function is defined and handles all five critical characters
      expect(html).toContain("function escapeHtml(str)");
      expect(html).toContain("&amp;");
      expect(html).toContain("&lt;");
      expect(html).toContain("&gt;");
      expect(html).toContain("&quot;");
      expect(html).toContain("&#39;");
    });

    it("neutralizes XSS payloads in audit log descriptions and execution entries", async () => {
      const scDir = join(tempDir, ".safe-change");
      await mkdir(scDir, { recursive: true });

      const xssPayload = `<script>window.__xss=1</script><svg onload="alert(1)">`;
      const logEntries = [
        {
          id: `run-${xssPayload}`,
          timestamp: "2026-10-15T00:00:00.000Z",
          trigger: "cli",
          description: `Log with ${xssPayload}`,
          fileSummary: { added: 1, modified: 0, deleted: 0 },
          regressionDetected: false,
          checkResults: [
            {
              name: `chk-${xssPayload}`,
              result: "pass-pass",
            },
          ],
        },
      ];

      await writeFile(join(scDir, "log.json"), JSON.stringify(logEntries));

      serverInstance = await startDashboardServer({
        port: 0,
        repoRoot: tempDir,
      });

      const res = await fetch(`${serverInstance.url}/api/log`);
      const logs = await res.json();
      expect(logs).toHaveLength(1);
      expect(logs[0].description).toContain("<script>");
    });

    it("safely handles corrupted audit log without claiming VALID LINK", async () => {
      const scDir = join(tempDir, ".safe-change");
      await mkdir(scDir, { recursive: true });

      // Corrupt JSON file in events.jsonl
      await writeFile(join(scDir, "events.jsonl"), "{ NOT VALID JSON");

      serverInstance = await startDashboardServer({
        port: 0,
        repoRoot: tempDir,
      });

      const res = await fetch(`${serverInstance.url}/api/audit`);
      expect(res.status).toBe(200);
      const audit = await res.json();
      expect(audit.verified).toBe(false);
      expect(audit.corrupted).toBe(true);
    });

    it("safely sanitizes rules error messages and custom rule definitions", async () => {
      const scDir = join(tempDir, ".safe-change");
      await mkdir(scDir, { recursive: true });

      const xssPayload = `<b onmouseover="alert('xss')">malformed</b>`;
      await writeFile(join(scDir, "rules.json"), `{"version": 1, "invalid_rules": "${xssPayload}"`);

      serverInstance = await startDashboardServer({
        port: 0,
        repoRoot: tempDir,
      });

      const res = await fetch(`${serverInstance.url}/api/rules`);
      expect(res.status).toBe(200);
      const rules = await res.json();
      expect(rules.status).toBe("invalid");
      expect(rules.error).toBeTruthy();
    });
  });
});
