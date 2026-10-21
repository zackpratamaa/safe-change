import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  readAuditEvents,
  verifyAuditEvents,
} from "../../src/integrity/audit-log.js";

// Compile the production modules so every writer owns an independent module
// graph and the test exercises the filesystem lock rather than shared memory.
const modules = [
  "security/state-files",
  "security/state-lock",
  "integrity/hash",
  "integrity/audit-log",
];
const workerSource = `
import { appendAuditEvent } from './integrity/audit-log.js';
const [root, worker] = process.argv.slice(2);
process.send('ready');
await new Promise(resolve => process.once('message', resolve));
for (let index = 0; index < 8; index++) {
  await appendAuditEvent(root, 'CONCURRENT_TEST', worker, { worker, index });
}
process.disconnect();
`;

describe("audit writers in separate processes", () => {
  let root: string;
  let runtime: string;
  let children: ChildProcess[];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "safe-change-audit-process-"));
    runtime = join(root, "runtime");
    children = [];
    await mkdir(runtime);
    await writeFile(join(runtime, "package.json"), '{"type":"module"}');
    for (const name of modules) {
      const source = await readFile(
        fileURLToPath(new URL(`../../src/${name}.ts`, import.meta.url)),
        "utf8"
      );
      const output = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ES2022,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText;
      const path = join(runtime, `${name}.js`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, output);
    }
    await writeFile(join(runtime, "worker.mjs"), workerSource);
  });

  afterEach(async () => {
    await Promise.all(
      children.map(async child => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        const exited = once(child, "exit");
        child.kill();
        await exited;
      })
    );
    await rm(root, { recursive: true, force: true });
  });

  function start(worker: string) {
    const child = fork(join(runtime, "worker.mjs"), [root, worker], {
      execArgv: [],
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    children.push(child);
    let stderr = "";
    child.stderr?.on("data", data => {
      stderr += String(data);
    });
    const ready = new Promise<string>((resolve, reject) => {
      child.once("message", message => resolve(String(message)));
      child.once("error", reject);
      child.once("exit", code =>
        reject(new Error(`Worker exited before ready (${code}): ${stderr}`))
      );
    });
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once("exit", resolve);
      child.once("error", reject);
    });
    return { child, ready, exited, stderr: () => stderr };
  }

  it.each([1, 2, 3])(
    "preserves a valid 48-event chain from six simultaneous writers (round %s)",
    async () => {
      const workers = Array.from({ length: 6 }, (_, index) =>
        start(String(index))
      );
      expect(await Promise.all(workers.map(worker => worker.ready))).toEqual(
        Array(6).fill("ready")
      );
      for (const worker of workers) worker.child.send("go");
      for (const worker of workers) {
        expect(await worker.exited, worker.stderr()).toBe(0);
      }

      const events = await readAuditEvents(root);
      expect(events).toHaveLength(48);
      expect(events.map(event => event.sequence)).toEqual(
        Array.from({ length: 48 }, (_, index) => index + 1)
      );
      expect(verifyAuditEvents(events)).toBe(true);
      expect(new Set(events.map(event => event.payloadDigest))).toHaveLength(48);
    }
  );
});
