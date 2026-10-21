import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderDashboardHtml } from "../../src/dashboard/template.js";
import { startDashboardServer } from "../../src/dashboard/server.js";

const root = resolve(__dirname, "../..");
const read = (name: string) => readFileSync(resolve(root, name), "utf8");

describe("Preview documentation credibility contracts", () => {
  it("matches the current root version in the security support table and labels the preview", () => {
    const version = (JSON.parse(read("package.json")) as { version: string })
      .version;
    const security = read("SECURITY.md");
    expect(security).toContain(`| \`${version}\` | Experimental preview |`);
    expect(security).toContain(
      "not a general-availability security certification",
    );
    expect(security).not.toContain("0.3.x is actively maintained");
  });

  it("puts the simple loop before opt-in policy terminology", () => {
    const readme = read("README.md");
    expect(readme.indexOf("safe-change save")).toBeGreaterThan(0);
    expect(readme.indexOf("safe-change save")).toBeLessThan(
      readme.indexOf("PDP/PEP"),
    );
    expect(readme).toContain(
      "## Opt-in advanced policy and integrity layer — Experimental",
    );
    expect(readme).not.toMatch(
      /100% deterministic|immutable audit event stream|Production Stable/,
    );
  });

  it("explicitly marks every advanced subsystem Experimental rather than asserting Stable", () => {
    const readme = read("README.md");
    const table = readme
      .split("### Maturity labels")[1]!
      .split("### Advanced command reference")[0]!;
    for (const feature of [
      "Risk engine",
      "Enterprise policy",
      "Streaming secret-output",
      "Local dashboard",
      "Capability decisions",
      "Approval requests",
      "Detached policy-root",
      "Write lease",
      "Evidence bundle",
      "Local audit chain",
      "AST heuristics",
      "Replay recording",
      "Ed25519 signing",
      "Command allowlist",
    ]) {
      const row = table
        .split("\n")
        .find((line) => line.startsWith(`| ${feature}`));
      expect(row, feature).toBeDefined();
      expect(row).toContain("| Experimental |");
    }
    expect(table).not.toMatch(/\| (Stable|Beta) \|/);
    expect(table).toContain("not yet independently verified");
  });

  it("uses local status naming in each known dashboard API reference", () => {
    for (const file of [
      "README.md",
      "SECURITY.md",
      "CHANGELOG.md",
      "ROADMAP.md",
      "docs/dashboard.md",
      "src/dashboard/template.ts",
    ]) {
      expect(read(file), file).not.toMatch(/telemetry\s+(?:API|endpoints)/i);
    }
    const security = read("SECURITY.md");
    expect(security).toContain("src/dashboard/server.ts");
    expect(security).toContain("tests/unit/dashboard-server.test.ts");
    expect(security).toContain(
      "Configured checks and programs launched by the user can independently access external networks",
    );
  });

  it("requires a written forward-looking major-release justification without inventing historical soak evidence", () => {
    const changelog = read("CHANGELOG.md");
    expect(changelog).toContain(
      "Every future MAJOR `x.0.0` proposal requires a written release justification",
    );
    expect(changelog).toContain("stabilization start/end dates");
    expect(changelog).toContain("tested commit/run links");
    expect(changelog).toContain(
      "not a claim that an automated release gate currently enforces every field",
    );
    expect(changelog).toContain(
      "No independently validated stabilization/soak period is recorded",
    );
  });

  it("renders local API requests without external asset or fetch URLs", () => {
    const html = renderDashboardHtml("credibility-fixture");
    expect(html).not.toMatch(/(?:src|href)\s*=\s*["'](?:https?:)?\/\//i);
    expect(html).not.toMatch(/url\(\s*["']?(?:https?:)?\/\//i);
    const calls = [...html.matchAll(/dashboardFetch\(['"]([^'"]+)['"]\)/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call[1]).toMatch(/^\/api\/[a-z]+$/);
    expect(html).toContain("fetch(dashboardBasePath + path)");
  });

  it("binds the actual status server to loopback and rejects mutation methods", async () => {
    const instance = await startDashboardServer({ port: 0, repoRoot: root });
    try {
      const address = instance.server.address();
      expect(address).not.toBeNull();
      expect(typeof address).toBe("object");
      expect((address as { address: string }).address).toBe("127.0.0.1");
      expect(instance.host).toBe("127.0.0.1");
      for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
        const response = await fetch(`${instance.url}/api/log`, { method });
        expect(response.status).toBe(405);
      }
      expect((await fetch(`${instance.url}/not-a-status-route`)).status).toBe(
        404,
      );
    } finally {
      await instance.close();
    }
  });
  it("keeps incomplete runner allocation evidence separate from passing commit-scoped proof", () => {
    const guide = read("docs/validation-evidence.md");
    expect(guide).toContain(
      "Cancelled, queued, skipped, and pending are not passing verification",
    );
    expect(guide).toContain("b01340d5abdc7a658c2dc6e77c3f68f45e65f941");
    expect(guide).toContain("39488828528");
    expect(guide).toContain("not subsequent edits");
    expect(guide).toContain("branch-protection settings");
  });
});
