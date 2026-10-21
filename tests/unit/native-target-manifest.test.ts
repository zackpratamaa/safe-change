import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ACTIVE_NATIVE_TARGETS } from "../../scripts/validate-release.mjs";
import { ACTIVE_TARGETS } from "../../scripts/publish-orchestrator.mjs";
import { PACKAGES_TO_VERIFY } from "../../scripts/preflight-npm.mjs";
import { TARGET_HOSTS } from "../../scripts/verify-built-native.mjs";
import {
  NATIVE_PACKAGE_NAMES,
  NATIVE_TARGET_HOSTS,
  NATIVE_TARGET_NAMES,
  NATIVE_TARGETS,
} from "../../scripts/native-targets.mjs";

describe("native target manifest", () => {
  it("defines six unique immutable targets and package names", () => {
    expect(NATIVE_TARGETS).toHaveLength(6);
    expect(new Set(NATIVE_TARGET_NAMES).size).toBe(NATIVE_TARGET_NAMES.length);
    expect(NATIVE_PACKAGE_NAMES).toEqual(
      NATIVE_TARGET_NAMES.map((target) => `@safe-change/${target}`),
    );
    expect(Object.isFrozen(NATIVE_TARGETS)).toBe(true);
    expect(NATIVE_TARGETS.every((target) => Object.isFrozen(target))).toBe(
      true,
    );
  });

  it("is the shared source for validation, publication, preflight, and host proof", () => {
    expect(ACTIVE_NATIVE_TARGETS).toBe(NATIVE_TARGET_NAMES);
    expect(ACTIVE_TARGETS).toBe(NATIVE_TARGET_NAMES);
    expect(PACKAGES_TO_VERIFY).toEqual([
      "safe-change",
      ...NATIVE_PACKAGE_NAMES,
    ]);
    expect(TARGET_HOSTS).toBe(NATIVE_TARGET_HOSTS);
    expect(Object.keys(TARGET_HOSTS)).toEqual(NATIVE_TARGET_NAMES);
  });

  it.each(["native-build.yml", "release.yml"])(
    "keeps the %s matrix exactly aligned with the manifest",
    (filename) => {
      const workflow = readFileSync(`.github/workflows/${filename}`, "utf8");
      const matrixTargets = [
        ...workflow.matchAll(/^\s+target:\s+([^\s#]+)\s*$/gm),
      ].map((match) => match[1]);
      expect(matrixTargets).toEqual(NATIVE_TARGET_NAMES);
    },
  );
});
