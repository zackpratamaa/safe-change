import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { readEntriesStrict } from "../../src/log/log-manager.js";
import { withStateLock, StateLockTimeoutError } from "../../src/security/state-lock.js";

// Compile the actual source, not a hand-written copy, for independent Node processes on Node 20+.
const modules = ["security/state-files", "security/state-lock", "log/schema", "log/log-manager"];
const workerSource = `
import { appendEntry, createLogEntry } from './log/log-manager.js';
import { withStateLock } from './security/state-lock.js';
const [root, worker, mode] = process.argv.slice(2);
if (mode === 'hold') {
  await withStateLock(root, 'log-write.lock', async () => {
    process.send('held');
    await new Promise(() => { setInterval(() => {}, 1000); });
  });
} else {
  process.send('ready');
  await new Promise(resolve => process.once('message', resolve));
  for (let i = 0; i < 8; i++) {
    await appendEntry(createLogEntry({ id: worker + '-' + i, description: null, baselineId: 'baseline', trigger: 'mcp', checkResults: [], fileSummary: { added: 0, modified: 0, deleted: 0, unchanged: 0 }, regressionDetected: false, durationMs: null }), root);
  }
  process.disconnect();
}
`;

describe("log writers in separate processes", () => {
  let root: string;
  let runtime: string;
  let children: ChildProcess[];
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "safe-change-process-"));
    runtime = join(root, "runtime");
    children = [];
    await mkdir(runtime);
    await writeFile(join(runtime, "package.json"), '{"type":"module"}');
    for (const name of modules) {
      const source = await readFile(fileURLToPath(new URL(`../../src/${name}.ts`, import.meta.url)), "utf8");
      const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
      const path = join(runtime, `${name}.js`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, output);
    }
    await writeFile(join(runtime, "worker.mjs"), workerSource);
  });
  afterEach(async () => {
    await Promise.all(children.map(async child => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }));
    await rm(root, { recursive: true, force: true });
  });
  function start(worker: string, mode = "append") {
    const child = fork(join(runtime, "worker.mjs"), [root, worker, mode], { execArgv: [], stdio: ["ignore", "ignore", "pipe", "ipc"] });
    children.push(child);
    let stderr = "";
    child.stderr?.on("data", data => { stderr += String(data); });
    const ready = new Promise<string>((resolve, reject) => {
      child.once("message", message => resolve(String(message)));
      child.once("error", reject);
      child.once("exit", code => reject(new Error(`Worker exited before ready (${code}): ${stderr}`)));
    });
    const exited = new Promise<number | null>((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
    return { child, ready, exited, stderr: () => stderr };
  }
  it("preserves all 48 distinct appends from six simultaneous writers", async () => {
    const workers = Array.from({ length: 6 }, (_, i) => start(String(i)));
    expect(await Promise.all(workers.map(worker => worker.ready))).toEqual(Array(6).fill("ready"));
    for (const worker of workers) worker.child.send("go");
    for (const worker of workers) expect(await worker.exited, worker.stderr()).toBe(0);
    const entries = await readEntriesStrict(root);
    expect(entries).toHaveLength(48);
    expect(new Set(entries.map(entry => entry.id))).toEqual(new Set(Array.from({ length: 6 }, (_, i) => Array.from({ length: 8 }, (_, j) => `${i}-${j}`)).flat()));
    expect(await readdir(join(root, ".safe-change"))).toEqual(["log.json"]);
  });
  it("preserves a crashed writer's lock until explicit offline recovery", async () => {
    const worker = start("owner", "hold");
    expect(await worker.ready).toBe("held");
    const path = join(root, ".safe-change", "log-write.lock");
    const record = await readFile(path, "utf8");
    // Deliberately terminate only this disposable fixture, never a CI job or workflow.
    worker.child.kill();
    await worker.exited;
    let called = false;
    await expect(withStateLock(root, "log-write.lock", async () => { called = true; }, { timeoutMs: 50 })).rejects.toBeInstanceOf(StateLockTimeoutError);
    expect(called).toBe(false);
    expect(await readFile(path, "utf8")).toBe(record);
    await unlink(path); // Fixture's sole owner has exited; simulate an operator's offline recovery.
    expect(await withStateLock(root, "log-write.lock", async () => "recovered")).toBe("recovered");
  });
});
