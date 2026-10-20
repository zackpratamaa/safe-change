import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(repository, 'dist', 'cli.js');
const java = process.env.JAVA_HOME
  ? join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
  : 'java';
const project = await mkdtemp(join(tmpdir(), 'sc-java-e2e-'));

function run(binary, args, expected = 0) {
  const result = spawnSync(binary, args, {
    cwd: project, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024,
    shell: false, windowsHide: true,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, expected, `${binary} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const check = (expected = 0) => JSON.parse(run(process.execPath, [cli, 'check', '--strict', '--json'], expected));

try {
  await mkdir(join(project, 'src'), { recursive: true });
  await mkdir(join(project, 'tools'), { recursive: true });
  const checker = join(project, 'tools', 'JavaSourceCheck.java');
  await copyFile(join(repository, 'tools', 'java', 'JavaSourceCheck.java'), checker);
  const good = 'public final class Greeting { public static String value() { return "ok"; } }\n';
  await writeFile(join(project, 'src', 'Greeting.java'), good);
  await writeFile(join(project, '.gitignore'), '.safe-change/\n');
  await writeFile(join(project, '.safe-change.json'), JSON.stringify({
    version: 1,
    checks: [{ name: 'java-compile', executable: java, args: ['tools/JavaSourceCheck.java', 'src'], timeout: 90 }],
  }));
  run('git', ['init']);
  run('git', ['config', 'user.email', 'java-ci@safe-change.local']);
  run('git', ['config', 'user.name', 'Java CI']);
  run('git', ['add', '.']);
  run('git', ['commit', '-m', 'Java verification fixture']);
  run(process.execPath, [cli, 'save', 'Java sources compile', '--json']);
  assert.equal(check().verification.state, 'verified');

  await writeFile(join(project, 'src', 'Greeting.java'), good.replace('return "ok"', 'return 123'));
  assert.equal(check(1).verification.state, 'failed');
  await writeFile(join(project, 'src', 'Greeting.java'), good);
  assert.equal(check().verification.state, 'verified');

  // A changed checker must not certify itself against the original baseline.
  await writeFile(checker, await readFile(checker, 'utf8') + '\n// checker changed after baseline\n');
  const drift = check(1);
  assert.equal(drift.verification.state, 'not-verified');
  assert.ok(drift.verificationInputDrift.includes('tools/JavaSourceCheck.java'));

  await mkdir(join(project, 'empty'));
  run(java, ['tools/JavaSourceCheck.java', 'empty'], 2);
  run(java, ['tools/JavaSourceCheck.java', 'does-not-exist'], 2);
  run(java, ['tools/JavaSourceCheck.java'], 2);
  assert.deepEqual((await import('node:fs/promises')).readdir
    ? (await (await import('node:fs/promises')).readdir(join(project, 'src'))).sort()
    : [], ['Greeting.java']);
  console.log('PASS: Java baseline, compile regression, repair, checker drift, invalid inputs and no class-file pollution');
} finally {
  await rm(project, { recursive: true, force: true });
}
