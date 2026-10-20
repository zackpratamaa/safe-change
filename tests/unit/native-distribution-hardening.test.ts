import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const scriptUrl = pathToFileURL(resolve("scripts/verify-built-native.mjs")).href;
const { assertTargetHost, verifyNativeExports } = await import(scriptUrl);
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));

describe("native distribution proof contracts", () => {
  it.each([
    ["linux-x64-gnu", "linux", "x64", "glibc"],
    ["linux-arm64-gnu", "linux", "arm64", "glibc"],
    ["linux-x64-musl", "linux", "x64", "musl"],
    ["win32-x64-msvc", "win32", "x64", null],
    ["darwin-arm64", "darwin", "arm64", null],
    ["darwin-x64", "darwin", "x64", null],
  ])("accepts the matching host for %s", (target, platform, arch, libc) => {
    expect(() => assertTargetHost(target, { platform, arch, libc })).not.toThrow();
  });
  it("rejects glibc execution offered as musl proof and the wrong architecture", () => {
    expect(() => assertTargetHost("linux-x64-musl", { platform: "linux", arch: "x64", libc: "glibc" })).toThrow();
    expect(() => assertTargetHost("linux-arm64-gnu", { platform: "linux", arch: "x64", libc: "glibc" })).toThrow();
    expect(() => assertTargetHost("linux-x64-gnu", { platform: "linux", arch: "x64", libc: null })).toThrow();
    expect(() => assertTargetHost("unknown", {})).toThrow();
  });
  it("rejects a stale native version or a fallback-like null boundary answer", () => {
    expect(() => verifyNativeExports({ version: () => "stale" }, "1.2.3", resolve("."))).toThrow();
    expect(() => verifyNativeExports({ version: () => "1.2.3", checkPathBoundary: () => null }, "1.2.3", resolve("."))).toThrow();
  });
  it.each(["linux-arm64-gnu", "linux-x64-musl"])("connects %s to install, publication and both build matrices", async (target) => {
    const root = json("package.json");
    const lock = json("package-lock.json");
    const pkg = json(`npm/${target}/package.json`);
    expect(root.optionalDependencies[pkg.name]).toBe(root.version);
    expect(lock.packages[""].optionalDependencies[pkg.name]).toBe(root.version);
    expect(lock.packages[`node_modules/${pkg.name}`].optional).toBe(true);
    expect(pkg.version).toBe(root.version);
    expect(pkg.libc).toEqual([target.endsWith("musl") ? "musl" : "glibc"]);
    const publish = await import(pathToFileURL(resolve("scripts/publish-orchestrator.mjs")).href);
    const preflight = await import(pathToFileURL(resolve("scripts/preflight-npm.mjs")).href);
    expect(publish.ACTIVE_TARGETS).toContain(target);
    expect(preflight.PACKAGES_TO_VERIFY).toContain(pkg.name);
    for (const file of ["native-build.yml", "release.yml"]) {
      const workflow = readFileSync(`.github/workflows/${file}`, "utf8");
      expect(workflow).toContain(`target: ${target}`);
      expect(workflow).toContain("ubuntu-24.04-arm");
      expect(workflow).toContain("node scripts/verify-built-native.mjs linux-x64-musl");
      expect(workflow).toContain("docker run --rm");
      expect(workflow).toContain("npx vitest run tests/native/");
      expect(workflow).not.toContain("fail-fast: true");
    }
  });
});
