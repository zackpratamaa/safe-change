import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";
import { runSave } from "../../src/commands/save.js";
import { loadBaseline } from "../../src/baseline/manager.js";
import { getFileEntries } from "../../src/git/inspector.js";
import { loadConfig } from "../../src/config/loader.js";
import { changedVerificationInputs } from "../../src/integrity/verification-binding.js";

describe("Java verification input guard", () => {
  let repo: TempRepo;
  let cwd: string;
  const paths = [
    "pom.xml", "module/pom.xml", "build.gradle", "build.gradle.kts",
    "settings.gradle", "settings.gradle.kts", "gradle.properties", "gradle.lockfile",
    "mvnw", "mvnw.cmd", "gradlew", "gradlew.bat", ".mvn/maven.config",
    "gradle/wrapper/gradle-wrapper.properties", "tools/CompileOracle.java",
  ];
  beforeEach(async () => {
    cwd = process.cwd();
    repo = await createTempRepo();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(async () => {
    process.chdir(cwd);
    vi.restoreAllMocks();
    await repo.cleanup();
  });
  it("requires review of changed JVM runners, wrappers and source-launched checkers", async () => {
    await repo.createConfig([{ name: "oracle", executable: process.execPath, args: ["-e", "process.exit(0)", "tools/CompileOracle.java"] }]);
    for (const path of paths) await repo.writeFile(path, "before\n");
    await repo.writeFile("src/main/java/BusinessLogic.java", "before\n");
    await repo.writeFile(".gitignore", ".safe-change/\n");
    process.chdir(repo.path);
    expect(await runSave({ description: "JVM inputs", format: "json" })).toBe(0);
    const baseline = await loadBaseline(repo.path);
    expect(baseline).not.toBeNull();
    for (const path of paths) await repo.writeFile(path, "after\n");
    await repo.writeFile("src/main/java/BusinessLogic.java", "after\n");
    const changed = changedVerificationInputs(repo.path, baseline!, await getFileEntries(repo.path), await loadConfig(repo.path));
    expect(changed).toEqual([...paths].sort());
  });
});
