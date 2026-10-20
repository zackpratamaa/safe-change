import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("native CI completion policy", () => {
  it("does not cancel other platform checks when one matrix target fails", async () => {
    const workflow = await readFile(new URL("../../.github/workflows/native-build.yml", import.meta.url), "utf8");
    expect(workflow).toMatch(/strategy:\s*\n\s+fail-fast: false/);
    expect(workflow).not.toMatch(/continue-on-error:\s*true/);
  });
});
