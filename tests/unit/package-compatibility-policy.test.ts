import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = readFileSync(
  ".github/workflows/package-compatibility.yml",
  "utf8",
);
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

describe("declared Node runtime compatibility", () => {
  it("tests the declared Node 18 floor and every maintained major through 24", () => {
    expect(pkg.engines.node).toBe(">=18.0.0");
    expect(workflow).toContain("node: [18, 20, 22, 24]");
    expect(workflow).toContain(
      "os: [ubuntu-latest, windows-latest, macos-latest]",
    );
    expect(workflow).not.toContain("continue-on-error");
  });

  it("builds once and exercises the same tarball in every runtime job", () => {
    expect(workflow).toContain("build-package:");
    expect(workflow).toContain("name: compatibility-root-tarball");
    expect(workflow).toContain("needs: build-package");
    expect(workflow).toContain("smoke-test-tarball.mjs --tarball");
    const runtimeJob = workflow.split("  clean-install:")[1]!;
    expect(runtimeJob).not.toContain("npm ci");
    expect(runtimeJob).not.toContain("npm run build");
    expect(runtimeJob).not.toContain("npm pack");
  });
});
