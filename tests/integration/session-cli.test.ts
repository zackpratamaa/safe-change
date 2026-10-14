import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { createTempRepo, type TempRepo } from '../helpers/temp-repo.js';
import { createSession, recordDecision, sessionGate } from '../../src/session/manager.js';
const cli = resolve(__dirname, '../../dist/cli.js');
const contract = { version: 1, intent: 'Change application', allowedPaths: ['app.js'], protectedPaths: [], requirements: [{ id: 'R1', description: 'Configured check passes', checks: ['test'] }], nonGoals: [] };
let repo: TempRepo;
function run(...args: string[]): Promise<{
    code: number;
    out: string;
    err: string;
}> {
    return new Promise(resolve => execFile(process.execPath, [cli, ...args], { cwd: repo.path, timeout: 15000 }, (error, out, err) => resolve({ code: typeof error?.code === 'number' ? error.code : error ? -1 : 0, out, err })));
}
beforeEach(async () => {
    repo = await createTempRepo();
    await repo.createConfig([{ name: 'test', executable: process.execPath, args: ['-e', 'process.exit(0)'] }]);
    await repo.writeFile('app.js', 'old behavior');
    await repo.git('add', '.');
    await repo.git('commit', '-m', 'initial application');
});
afterEach(async () => repo.cleanup());
describe('session CLI and real verifier integration', () => {
    it('starts from a contract and exposes honest status', async () => {
        await repo.writeFile('contract.json', JSON.stringify(contract));
        expect((await run('session', 'start', 'cli-task', '--file', 'contract.json', '--json')).code).toBe(0);
        const result = await run('session', 'status', 'cli-task', '--json');
        expect(JSON.parse(result.out)).toMatchObject({ choice: 'awaiting-user', monitoring: 'stopped' });
        expect((await run('session', 'gate', 'cli-task', 'before-edit')).code).toBe(1);
    });
    it('refuses non-interactive self-approval and choice arguments', async () => {
        await createSession(repo.path, 'cli-task', contract);
        expect((await run('session', 'decide', 'cli-task')).code).toBe(3);
        expect((await run('session', 'decide', 'cli-task', 'now')).code).toBe(3);
    });
    it('requires the original baseline before immediate verification mode', async () => {
        await createSession(repo.path, 'cli-task', contract);
        await recordDecision(repo.path, 'cli-task', 'now');
        expect((await sessionGate(repo.path, 'cli-task', 'before-edit')).decision).toBe('block');
        expect((await run('save', 'before-edit', '--json')).code).toBe(0);
        expect((await sessionGate(repo.path, 'cli-task', 'before-edit')).decision).toBe('allow');
    });
    it('accepts fresh bound verification, then rejects source and baseline drift', async () => {
        await createSession(repo.path, 'cli-task', contract);
        await recordDecision(repo.path, 'cli-task', 'before-finish');
        expect((await run('save', 'initial', '--json')).code).toBe(0);
        await repo.writeFile('app.js', 'new behavior');
        expect((await run('check', '--strict', '--json')).code).toBe(0);
        expect((await sessionGate(repo.path, 'cli-task', 'before-finish')).verification).toBe('verified');
        await repo.writeFile('app.js', 'later edit');
        expect((await sessionGate(repo.path, 'cli-task', 'before-finish')).decision).toBe('ask');
        // Saving a post-edit baseline must not manufacture preservation of the initial behavior.
        expect((await run('save', 'late-baseline', '--json')).code).toBe(0);
        expect((await run('check', '--strict', '--json')).code).toBe(0);
        expect((await sessionGate(repo.path, 'cli-task', 'before-finish')).verification).toBe('not-verified');
    });
    it('requires every declared check mapping rather than trusting a green overall state', async () => {
        await createSession(repo.path, 'cli-task', { ...contract, requirements: [{ id: 'R2', description: 'Missing check', checks: ['nonexistent'] }] });
        await recordDecision(repo.path, 'cli-task', 'before-finish');
        await run('save', 'initial', '--json');
        await run('check', '--strict', '--json');
        expect((await sessionGate(repo.path, 'cli-task', 'before-finish')).verification).toBe('not-verified');
    });
    it('rejects malformed and missing hook state with blocking hook exit 2', async () => {
        expect((await run('session', 'hook', 'missing-task', 'before-edit')).code).toBe(2);
        await createSession(repo.path, 'cli-task', contract);
        const result = await run('session', 'hook', 'cli-task', 'before-edit');
        expect(result.code, result.err).toBe(0);
        expect(JSON.parse(result.out)).toMatchObject({ hookSpecificOutput: { permissionDecision: 'ask' } });
        expect(JSON.parse((await run('session', 'hook', 'cli-task', 'before-finish')).out)).toMatchObject({ decision: 'block' });
    });
    it('does not turn invalid summary data into verified status', async () => {
        await createSession(repo.path, 'cli-task', contract);
        await recordDecision(repo.path, 'cli-task', 'before-finish');
        await writeFile(join(repo.path, '.safe-change/last-verification-summary.json'), '{"schemaVersion":1,"state":"verified","generatedAt":"invalid"}');
        expect((await sessionGate(repo.path, 'cli-task', 'before-finish')).verification).toBe('not-verified');
        expect(await readFile(join(repo.path, 'app.js'), 'utf8')).toBe('old behavior');
    });
});
