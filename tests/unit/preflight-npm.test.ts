import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkPackageVersionStatus, verifyNpmAuth, classifyReleaseState, PACKAGES_TO_VERIFY } from "../../scripts/preflight-npm.mjs";

describe("scripts/preflight-npm.mjs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("checkPackageVersionStatus", () => {
    it("classifies HTTP 404 as not_published", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 404,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await checkPackageVersionStatus("safe-change", "0.3.1");
      expect(result.status).toBe("not_published");
      expect(result.code).toBe(404);
      expect(mockFetch).toHaveBeenCalledWith("https://registry.npmjs.org/safe-change/0.3.1", expect.any(Object));
    });

    it("classifies HTTP 200 as already_published", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: vi.fn().mockResolvedValue({
          name: "@safe-change/linux-x64-gnu",
          version: "0.3.1",
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await checkPackageVersionStatus("@safe-change/linux-x64-gnu", "0.3.1");
      expect(result.status).toBe("already_published");
      expect(result.code).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith("https://registry.npmjs.org/%40safe-change%2Flinux-x64-gnu/0.3.1", expect.any(Object));
    });

    it("classifies HTTP 401/403 as auth_error", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 403,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await checkPackageVersionStatus("safe-change", "0.3.1");
      expect(result.status).toBe("auth_error");
      expect(result.code).toBe(403);
    });

    it("handles fetch network errors safely", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("ENOTFOUND registry.npmjs.org"));
      vi.stubGlobal("fetch", mockFetch);

      const result = await checkPackageVersionStatus("safe-change", "0.3.1");
      expect(result.status).toBe("network_error");
      expect(result.error).toContain("ENOTFOUND");
    });
  });

  describe("verifyNpmAuth", () => {
    it("returns authenticated false when neither NODE_AUTH_TOKEN nor NPM_TOKEN is set", () => {
      const oldToken = process.env.NODE_AUTH_TOKEN;
      const oldNpmToken = process.env.NPM_TOKEN;
      delete process.env.NODE_AUTH_TOKEN;
      delete process.env.NPM_TOKEN;

      try {
        const result = verifyNpmAuth();
        expect(result.authenticated).toBe(false);
        expect(result.error).toContain("is not set");
      } finally {
        if (oldToken) process.env.NODE_AUTH_TOKEN = oldToken;
        if (oldNpmToken) process.env.NPM_TOKEN = oldNpmToken;
      }
    });
  });

  describe("classifyReleaseState", () => {
    const version = "0.3.1";
    const unpublished = (pkg: string) => ({ status: "not_published", pkg, version, code: 404 });
    const published = (pkg: string) => ({ status: "already_published", pkg, version, code: 200 });

    it("selects full mode when every package is unpublished", () => {
      expect(classifyReleaseState(PACKAGES_TO_VERIFY.map(unpublished)).mode).toBe("full");
    });

    it("selects root-recovery when all native packages are published", () => {
      const results = [unpublished("safe-change"), ...PACKAGES_TO_VERIFY.slice(1).map(published)];
      expect(classifyReleaseState(results).mode).toBe("root-recovery");
    });

    it("rejects mixed native publication state", () => {
      const results = PACKAGES_TO_VERIFY.map(unpublished);
      results[1] = published(PACKAGES_TO_VERIFY[1]);
      expect(classifyReleaseState(results).mode).toBe("mixed");
    });
  });

  describe("PACKAGES_TO_VERIFY list", () => {
    it("includes root package and all six active native targets", () => {
      expect(PACKAGES_TO_VERIFY).toHaveLength(7);
      expect(PACKAGES_TO_VERIFY).toContain("safe-change");
      expect(PACKAGES_TO_VERIFY).toContain("@safe-change/linux-x64-gnu");
      expect(PACKAGES_TO_VERIFY).toContain("@safe-change/linux-arm64-gnu");
      expect(PACKAGES_TO_VERIFY).toContain("@safe-change/linux-x64-musl");
      expect(PACKAGES_TO_VERIFY).toContain("@safe-change/win32-x64-msvc");
      expect(PACKAGES_TO_VERIFY).toContain("@safe-change/darwin-arm64");
      expect(PACKAGES_TO_VERIFY).toContain("@safe-change/darwin-x64");
    });
  });
});
