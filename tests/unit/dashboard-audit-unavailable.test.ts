import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { renderDashboardHtml } from "../../src/dashboard/template.js";

// Execute the rendered function itself. Other renderers are inert spies; the
// audit request's rejection/HTTP status and resulting model are not stubbed out.
async function loadAudit(fetchAudit: () => Promise<unknown>) {
  const html = renderDashboardHtml("audit-unavailable-fixture");
  const start = html.indexOf("async function loadData()");
  const end = html.indexOf("function updateHeroStats(", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  let audit: unknown;
  const noop = () => undefined;
  const context = {
    window: { location: { pathname: "/session-token" } },
    fetch: (path: string) =>
      path.endsWith("/api/audit")
        ? fetchAudit()
        : Promise.resolve({ ok: true, json: async () => ({}) }),
    console: {
      error: (error: unknown) => {
        throw error;
      },
    },
    globalLogEntries: [],
    updateHeroStats: noop,
    renderStatus: noop,
    renderTimeline: noop,
    renderLogTable: noop,
    renderRules: noop,
    renderEnterprise: noop,
    renderVerifiable: noop,
    renderIdentity: noop,
    renderAudit: (value: unknown) => {
      audit = value;
    },
  };
  await runInNewContext(`${html.slice(start, end)}\nloadData()`, context);
  return audit;
}

describe("audit transport failures cannot fabricate verification", () => {
  it("shows unavailable after network rejection", async () => {
    expect(
      await loadAudit(() => Promise.reject(new Error("offline"))),
    ).toMatchObject({ verified: false, unavailable: true, totalEvents: 0 });
  });
  it("rejects a non-success HTTP response even if its JSON claims verified", async () => {
    expect(
      await loadAudit(async () => ({
        ok: false,
        json: async () => ({ verified: true }),
      })),
    ).toMatchObject({ verified: false, unavailable: true });
  });
  it("retains an actual successful status response", async () => {
    expect(
      await loadAudit(async () => ({
        ok: true,
        json: async () => ({ verified: true, totalEvents: 2, events: [] }),
      })),
    ).toMatchObject({ verified: true, totalEvents: 2 });
  });
});

describe("audit table uses the recorded event schema", () => {
  it("renders actual digest and session fields instead of nonexistent hash/actor aliases", () => {
    const html = renderDashboardHtml("audit-fields-fixture");
    const start = html.indexOf("function renderAudit(audit)");
    const end = html.indexOf("function initEventHandlers()", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const cells: Record<
      string,
      { textContent: string; className: string; innerHTML: string }
    > = {};
    for (const id of [
      "audit-body",
      "audit-events-count-badge",
      "audit-integrity-badge",
    ]) {
      cells[id] = { textContent: "", className: "", innerHTML: "" };
    }
    runInNewContext(`${html.slice(start, end)}\nrenderAudit(model)`, {
      document: { getElementById: (id: string) => cells[id] },
      escapeHtml: (value: unknown) => String(value),
      model: {
        verified: true,
        totalEvents: 1,
        events: [
          {
            timestamp: "2026-01-01T00:00:00Z",
            type: "CHECKED",
            sessionId: "recorded-session",
            eventDigest: "sha256:abcdef123456",
            previousDigest: "sha256:123456abcdef",
          },
        ],
      },
    });
    expect(cells["audit-body"]!.innerHTML).toContain("sha256:abcde");
    expect(cells["audit-body"]!.innerHTML).toContain("sha256:12345");
    expect(cells["audit-body"]!.innerHTML).toContain("recorded-session");
    expect(cells["audit-integrity-badge"]!.textContent).toBe(
      "LOCAL DIGEST LINKS CONSISTENT",
    );
  });
});
