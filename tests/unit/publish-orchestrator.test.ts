import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ACTIVE_TARGETS, pollPackageVisibility, sha256File, findRootTarball } from "../../scripts/publish-orchestrator.mjs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("scripts/publish-orchestrator.mjs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("ACTIVE_TARGETS", () => {
    it("contains exactly the six active native compilation targets", () => {
      expect(ACTIVE_TARGETS).toHaveLength(6);
      expect(ACTIVE_TARGETS).toEqual([
        "linux-x64-gnu",
        "linux-arm64-gnu",
        "linux-x64-musl",
        "win32-x64-msvc",
        "darwin-arm64",
        "darwin-x64",
      ]);
    });
  });

  describe("pollPackageVisibility", () => {
    it("returns true immediately when package version responds with HTTP 200", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ status: 200 });
      vi.stubGlobal("fetch", mockFetch);

      const visible = await pollPackageVisibility("safe-change", "0.3.1", "https://registry.npmjs.org", 2, 10);
      expect(visible).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("polls repeatedly and returns true when package becomes visible", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ status: 200 });
      vi.stubGlobal("fetch", mockFetch);

      const visible = await pollPackageVisibility("@safe-change/linux-x64-gnu", "0.3.1", "https://registry.npmjs.org", 3, 10);
      expect(visible).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("returns false when max attempts expire without HTTP 200", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ status: 404 });
      vi.stubGlobal("fetch", mockFetch);

      const visible = await pollPackageVisibility("@safe-change/win32-x64-msvc", "0.3.1", "https://registry.npmjs.org", 2, 10);
      expect(visible).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});


describe("exact release artifacts", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "safe-change-release-artifact-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("selects and hashes the exact root tarball", () => {
    const path = join(dir, "safe-change-0.3.1.tgz");
    writeFileSync(path, "verified artifact");
    const result = findRootTarball(dir, "safe-change", "0.3.1");
    expect(result.path).toBe(path);
    expect(result.sha256).toBe(sha256File(path));
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a missing root tarball", () => {
    expect(() => findRootTarball(dir, "safe-change", "0.3.1")).toThrow(/Expected exact root tarball/);
  });
});
