import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflow = readFileSync(
  resolve(".github/workflows/release.yml"),
  "utf-8",
);

describe("release workflow production policy", () => {
  it("keeps manual dispatch non-publishing", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("github.event.inputs.dry_run");
    expect(workflow).toContain("dry-run-artifacts:");
    expect(workflow).toContain("publish-orchestrator.mjs --dry-run");
  });

  it("passes the immutable Git tag to strict validation", () => {
    expect(workflow).toContain(
      'validate-release.mjs "${{ github.ref_name }}" --require-tag',
    );
  });

  it("guards every publication job with a tag-push condition", () => {
    const guard =
      "if: github.event_name == 'push' && github.ref_type == 'tag' && startsWith(github.ref_name, 'v')";
    expect(workflow.split(guard)).toHaveLength(3);
  });

  it("binds npm preflight to the protected production environment", () => {
    const preflight =
      workflow.split("  preflight:")[1]?.split("  build-native:")[0] ?? "";
    expect(preflight).toContain("environment: npm-production");
  });

  it("generates a CycloneDX SBOM for release evidence", () => {
    expect(workflow).toContain("npm sbom --sbom-format cyclonedx");
    expect(workflow).toContain("safe-change-sbom.cdx.json");
  });

  it("binds every publish step to one source-scoped artifact manifest", () => {
    expect(workflow).toContain("bind-artifacts:");
    expect(workflow).toContain("publish-orchestrator.mjs --phase prepare");
    expect(workflow).toContain("name: bound-release-artifacts");
    expect(workflow).toContain("release-artifact-manifest.json.sha256");
    expect(
      workflow.match(/Verify bound artifact manifest before/g),
    ).toHaveLength(2);
    expect(workflow.indexOf("bind-artifacts:")).toBeLessThan(
      workflow.indexOf("publish-native:"),
    );
  });

  it("publishes through the orchestrator instead of npm publish in YAML", () => {
    expect(workflow).not.toMatch(/run:\s+npm publish/);
    expect(workflow).toContain("publish-orchestrator.mjs --phase native");
    expect(workflow).toContain("publish-orchestrator.mjs --phase root");
  });
});
