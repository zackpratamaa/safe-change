import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ACTIVE_TARGETS,
  ARTIFACT_MANIFEST,
  BOUND_RELEASE_DIR,
  createPackageTarball,
  findRootTarball,
  pollPackageVisibility,
  prepareBoundReleaseArtifacts,
  sha256File,
  validateBoundReleaseArtifacts,
} from "../../scripts/publish-orchestrator.mjs";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

      const visible = await pollPackageVisibility(
        "safe-change",
        "0.3.1",
        "https://registry.npmjs.org",
        2,
        10,
      );
      expect(visible).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("polls repeatedly and returns true when package becomes visible", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ status: 200 });
      vi.stubGlobal("fetch", mockFetch);

      const visible = await pollPackageVisibility(
        "@safe-change/linux-x64-gnu",
        "0.3.1",
        "https://registry.npmjs.org",
        3,
        10,
      );
      expect(visible).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("returns false when max attempts expire without HTTP 200", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ status: 404 });
      vi.stubGlobal("fetch", mockFetch);

      const visible = await pollPackageVisibility(
        "@safe-change/win32-x64-msvc",
        "0.3.1",
        "https://registry.npmjs.org",
        2,
        10,
      );
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
    expect(() => findRootTarball(dir, "safe-change", "0.3.1")).toThrow(
      /Expected exact root tarball/,
    );
  });
});

describe("bound release artifact manifest", () => {
  let dir: string;
  const version = "1.2.3-preview.1";
  const sourceSha = "a".repeat(40);
  const runId = "12345";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "safe-change-bound-release-"));
    const optionalDependencies = Object.fromEntries(
      ACTIVE_TARGETS.map((target) => [`@safe-change/${target}`, version]),
    );
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "safe-change", version, optionalDependencies }),
    );

    for (const target of ACTIVE_TARGETS) {
      const packageDir = join(dir, "npm", target);
      mkdirSync(packageDir, { recursive: true });
      writeFileSync(
        join(packageDir, "package.json"),
        JSON.stringify({
          name: `@safe-change/${target}`,
          version,
          files: ["safe-change-native.node"],
        }),
      );
      const artifactDir = join(dir, "artifacts", `native-binary-${target}`);
      mkdirSync(artifactDir, { recursive: true });
      writeFileSync(join(artifactDir, `${target}.node`), `binary-${target}`);
    }

    const rootPackageDir = join(dir, "root-package");
    mkdirSync(rootPackageDir);
    writeFileSync(
      join(rootPackageDir, "package.json"),
      JSON.stringify({ name: "safe-change", version, optionalDependencies }),
    );
    const rootArtifactsDir = join(dir, "root-artifacts");
    createPackageTarball(rootPackageDir, rootArtifactsDir);
    writeFileSync(join(rootArtifactsDir, "safe-change-sbom.cdx.json"), "{}\n");
    const evidencePath = join(rootArtifactsDir, "release-evidence.tar.gz");
    writeFileSync(evidencePath, "bound-evidence");
    writeFileSync(
      `${evidencePath}.sha256`,
      `${sha256File(evidencePath)}  release-evidence.tar.gz\n`,
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("binds root, all native packages, SBOM, and self-evidence before publication", () => {
    const manifest = prepareBoundReleaseArtifacts({
      rootDir: dir,
      sourceSha,
      runId,
    });
    expect(manifest.sourceSha).toBe(sourceSha);
    expect(manifest.runId).toBe(runId);
    expect(manifest.artifacts).toHaveLength(10);
    expect(
      manifest.artifacts.filter(
        (entry: any) => entry.kind === "native-package",
      ),
    ).toHaveLength(6);
    expect(() =>
      validateBoundReleaseArtifacts({ rootDir: dir, sourceSha, runId }),
    ).not.toThrow();
    expect(sha256File(join(dir, BOUND_RELEASE_DIR, ARTIFACT_MANIFEST))).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it("rejects any tarball mutation after the manifest is produced", () => {
    const manifest = prepareBoundReleaseArtifacts({
      rootDir: dir,
      sourceSha,
      runId,
    });
    const native = manifest.artifacts.find(
      (entry: any) => entry.kind === "native-package",
    );
    appendFileSync(join(dir, BOUND_RELEASE_DIR, native.file), "tampered");
    expect(() =>
      validateBoundReleaseArtifacts({ rootDir: dir, sourceSha, runId }),
    ).toThrow(/Bound release artifact mismatch/);
  });

  it("rejects provenance from another source commit or workflow run", () => {
    prepareBoundReleaseArtifacts({ rootDir: dir, sourceSha, runId });
    expect(() =>
      validateBoundReleaseArtifacts({
        rootDir: dir,
        sourceSha: "b".repeat(40),
        runId,
      }),
    ).toThrow(/provenance/);
    expect(() =>
      validateBoundReleaseArtifacts({ rootDir: dir, sourceSha, runId: "999" }),
    ).toThrow(/provenance/);
  });
});
