import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";
import { runSave } from "../../src/commands/save.js";
import { runCheck } from "../../src/commands/check.js";
import { runSemanticDiff } from "../../src/commands/semantic-diff.js";
import { loadConfig } from "../../src/config/loader.js";
import { createEvidenceBundle } from "../../src/integrity/evidence.js";
import { loadBaseline } from "../../src/baseline/manager.js";
import { SemanticDiffEngine } from "../../src/semantic/engine.js";

describe("Verification snapshot and oracle hardening", () => {
  let repo: TempRepo;
  let stdout = "";
  let originalCwd: string;
  const originalOut = process.stdout.write;
  const originalErr = process.stderr.write;
  const good = "module.exports = () => 1;\n";
  const bad = "module.exports = () => 2;\n";
  const honest = "require('node:assert/strict').equal(require('./logic.cjs')(), 1);\n";

  beforeEach(async () => {
    repo = await createTempRepo();
    originalCwd = process.cwd();
    await repo.writeFile(".gitignore", ".safe-change/\ndist/\n");
    await repo.writeFile("logic.cjs", good);
    await repo.writeFile("check.cjs", honest);
    await repo.createConfig([{ name: "behavior", executable: process.execPath, args: ["check.cjs"], timeout: 5 }]);
    await repo.git("add", ".");
    await repo.git("commit", "-m", "fixture");
    stdout = "";
    process.stdout.write = ((chunk: string | Buffer) => {
      stdout += chunk.toString(); return true;
    }) as typeof process.stdout.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    process.chdir(repo.path);
  });
  afterEach(async () => {
    process.chdir(originalCwd);
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
    await repo.cleanup();
  });
  async function save() {
    stdout = "";
    expect(await runSave({ description: "accepted", format: "json" })).toBe(0);
  }
  async function check(strict = false) {
    stdout = "";
    const code = await runCheck({ format: "json", strict });
    return { code, report: JSON.parse(stdout) };
  }
  async function evidence() {
    return createEvidenceBundle(repo.path, await loadConfig(repo.path), "hardening-evidence");
  }

  it("still verifies an unchanged honest test and detects a real regression", async () => {
    await save();
    expect((await check(true)).report.verification.state).toBe("verified");
    await repo.writeFile("logic.cjs", bad);
    const result = await check(true);
    expect(result.code).toBe(1);
    expect(result.report.verification.state).toBe("failed");
  });
  it("does not mark a weakened same-command test as verified", async () => {
    await save();
    await repo.writeFile("logic.cjs", bad);
    await repo.writeFile("check.cjs", "require('node:assert/strict').equal(1, 1);\n");
    const result = await check(true);
    expect(result.code).toBe(1);
    expect(result.report.verification.state).toBe("not-verified");
    expect(result.report.verificationInputDrift).toContain("check.cjs");
  });
  it("conservatively requires review even for a legitimate assertion edit", async () => {
    await save();
    await repo.writeFile("check.cjs", honest + "// reviewed change pending acceptance\n");
    expect((await check(true)).report.verification.state).toBe("not-verified");
    await save(); // Explicit acceptance by the local operator, not an OS security boundary.
    expect((await check(true)).report.verification.state).toBe("verified");
  });
  it("guards conventional test paths, including newly added tests", async () => {
    await repo.writeFile("tests/old.test.js", "const expected = 1;\n");
    await save();
    await repo.writeFile("tests/old.test.js", "const expected = 2;\n");
    await repo.writeFile("tests/new.test.js", "const expected = 3;\n");
    expect((await check()).report.verificationInputDrift).toEqual(["tests/new.test.js", "tests/old.test.js"]);
  });
  it("guards configured oracle fixture paths", async () => {
    const config = JSON.parse(await readFile(join(repo.path, ".safe-change.json"), "utf8"));
    config.protectedVerificationPaths = ["contracts/**"];
    await repo.writeFile(".safe-change.json", JSON.stringify(config));
    await repo.writeFile("contracts/response.json", '{"expected":1}\n');
    await save();
    await repo.writeFile("contracts/response.json", '{"expected":2}\n');
    expect((await check(true)).report.verificationInputDrift).toContain("contracts/response.json");
  });
  it.each([["../outside"], ["/absolute"], ["C:/absolute"], [""]])(
    "rejects unsafe protected path configuration %j", async (path) => {
      await repo.writeFile(".safe-change.json", JSON.stringify({ version: 1, checks: [], protectedVerificationPaths: [path] }));
      await expect(loadConfig(repo.path)).rejects.toThrow("protectedVerificationPaths");
    },
  );
  it("reports the final source and invalidates mutation during a check", async () => {
    await repo.writeFile("check.cjs", honest + "if (require('node:fs').existsSync('.safe-change/mutate')) require('node:fs').writeFileSync('logic.cjs', 'module.exports = () => 2;\\n');\n");
    await save();
    await repo.writeFile(".safe-change/mutate", "");
    const result = await check(true);
    expect(result.code).toBe(1);
    expect(result.report.inputMutationDetected).toBe(true);
    expect(result.report.files.modified).toContain("logic.cjs");
    expect(result.report.verification.state).toBe("not-verified");
  });
  it("rejects baseline creation if checks mutate source", async () => {
    await repo.writeFile("check.cjs", honest + "require('node:fs').writeFileSync('logic.cjs', 'module.exports = () => 2;\\n');\n");
    expect(await runSave({ description: "mutating", format: "json" })).toBe(1);
    expect(await loadBaseline(repo.path)).toBeNull();
  });
  it("preserves an existing baseline if a replacement check mutates inputs", async () => {
    await save();
    const previous = await readFile(join(repo.path, ".safe-change/baseline.json"), "utf8");
    await repo.writeFile("check.cjs", honest + "require('node:fs').writeFileSync('logic.cjs', 'module.exports = () => 2;\\n');\n");
    expect(await runSave({ description: "mutating replacement", format: "json" })).toBe(1);
    expect(await readFile(join(repo.path, ".safe-change/baseline.json"), "utf8")).toBe(previous);
  });
  it("allows ignored build outputs without pretending they are bound inputs", async () => {
    await repo.writeFile("check.cjs", honest + "require('node:fs').mkdirSync('dist', {recursive:true}); require('node:fs').writeFileSync('dist/output.js', '// generated');\n");
    await save();
    expect((await check(true)).report.verification.state).toBe("verified");
  });
  it("keeps fresh evidence verified and downgrades stale source evidence", async () => {
    await save(); await check(true);
    expect((await evidence()).manifest.verificationFreshness).toBe("fresh");
    await repo.writeFile("logic.cjs", bad);
    const result = await evidence();
    expect(result.manifest.verificationState).toBe("not-verified");
    expect(result.manifest.verificationFreshness).toBe("stale");
    const report = JSON.parse(await readFile(join(result.directory, "verification-report.json"), "utf8"));
    expect(report.state).toBe("not-verified");
    expect(report.reason).toContain("stale");
  });
  it("invalidates evidence when a new baseline replaces one at the same HEAD", async () => {
    await save(); await check();
    const firstId = (await evidence()).manifest.baselineId;
    await runSave({ description: "replacement baseline", format: "json" });
    const result = await evidence();
    expect(result.manifest.baselineId).not.toBe(firstId);
    expect(result.manifest.verificationState).toBe("not-verified");
  });
  it("downgrades old verification summaries that have no source binding", async () => {
    await save(); await check();
    const summaryPath = join(repo.path, ".safe-change/last-verification-summary.json");
    const summary = JSON.parse(await readFile(summaryPath, "utf8"));
    delete summary.verificationBinding;
    await writeFile(summaryPath, JSON.stringify(summary));
    expect((await evidence()).manifest.verificationFreshness).toBe("stale");
    expect((await evidence()).manifest.verificationState).toBe("not-verified");
  });
  it("marks evidence without any check report as missing", async () => {
    await save();
    expect((await evidence()).manifest.verificationFreshness).toBe("missing");
  });
  it("invalidates evidence when rules change outside the Git-visible tree", async () => {
    await save(); await check();
    await repo.writeFile(".safe-change/rules.json", '{"version":1,"rules":[]}\n');
    expect((await evidence()).manifest.verificationState).toBe("not-verified");
  });
  it("preserves legacy fail-fail exit zero but strict returns one", async () => {
    await repo.writeFile("check.cjs", "process.exit(1);\n");
    await save();
    expect((await check()).code).toBe(0);
    const strict = await check(true);
    expect(strict.code).toBe(1);
    expect(strict.report.verification.state).toBe("failed");
  });
  it("strict rejects a removed verification configuration", async () => {
    await save();
    await repo.writeFile(".safe-change.json", '{"version":1,"checks":[]}');
    expect((await check()).code).toBe(0);
    const strict = await check(true);
    expect(strict.code).toBe(1);
    expect(strict.report.verification.state).toBe("not-verified");
  });
  it("includes deletion in semantic diff and blocks it by default", async () => {
    await rm(join(repo.path, "logic.cjs"));
    stdout = "";
    expect(await runSemanticDiff({ format: "json" })).toBe(1);
    const report = JSON.parse(stdout);
    expect(report.files.map((file: {file:string}) => file.file)).toContain("logic.cjs");
    expect(report.summary.criticalCount).toBeGreaterThan(0);
  });
  it("treats emptying JSON source as a deletion instead of a parser omission", () => {
    const result = new SemanticDiffEngine().compareContents("api.json", '{"contract":true}', "");
    expect(result?.findings[0]?.category).toBe("source-file-deleted");
  });
  it("fails closed for an invalid semantic comparison base", async () => {
    await expect(runSemanticDiff({ format: "json", baseCommit: "nonexistent-audit-base" })).rejects.toThrow();
  });
});