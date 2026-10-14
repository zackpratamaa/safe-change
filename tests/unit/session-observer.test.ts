import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTempRepo, type TempRepo } from '../helpers/temp-repo.js';
import { createSession, loadSession, recordDecision, observeSession, sessionGate, monitorHealth, validateContract, watchSession } from '../../src/session/manager.js';
let repo: TempRepo;
const contract = { version: 1 as const, intent: 'Add feature without breaking old behavior', allowedPaths: ['src/', 'tests/'], protectedPaths: ['tests/'], requirements: [{ id: 'R1', description: 'Old behavior stays usable', checks: ['test'] }], nonGoals: ['No authentication rewrite'] };
beforeEach(async () => { repo = await createTempRepo(); await repo.writeFile('src/app.ts', 'export const value = 1;'); await repo.git('add', '.'); await repo.git('commit', '-m', 'app'); });
afterEach(async () => repo.cleanup());
describe('task sessions and continuous observation', () => {
    it('creates a read-only observation, not a verification baseline', async () => {
        const state = await createSession(repo.path, 'task-1', contract);
        expect(state.choice).toBe('awaiting-user');
        expect(monitorHealth(state)).toBe('stopped');
        expect((await sessionGate(repo.path, 'task-1', 'before-edit')).decision).toBe('ask');
        await expect(readFile(join(repo.path, '.safe-change/baseline.json'))).rejects.toThrow();
    });
    it('persists deferred choice across reloads without claiming verification', async () => {
        await createSession(repo.path, 'task-1', contract);
        await recordDecision(repo.path, 'task-1', 'before-finish');
        expect((await loadSession(repo.path, 'task-1')).choice).toBe('before-finish');
        expect((await sessionGate(repo.path, 'task-1', 'before-edit')).decision).toBe('allow');
        expect((await sessionGate(repo.path, 'task-1', 'before-finish')).decision).toBe('ask');
    });
    it('observes edits and protected inputs while verification is deferred', async () => {
        await createSession(repo.path, 'task-1', contract);
        await recordDecision(repo.path, 'task-1', 'before-finish');
        await repo.writeFile('src/app.ts', 'export const value = 2;');
        await repo.writeFile('tests/app.test.ts', 'weakened oracle');
        const state = await observeSession(repo.path, 'task-1');
        expect(state.observation.changedPaths).toEqual(['src/app.ts', 'tests/app.test.ts']);
        expect(state.observation.protectedChanges).toContain('tests/app.test.ts');
        expect((await sessionGate(repo.path, 'task-1', 'before-finish')).decision).toBe('block');
    });
    it('blocks edits outside declared scope', async () => {
        await createSession(repo.path, 'task-1', contract);
        await recordDecision(repo.path, 'task-1', 'before-finish');
        await repo.writeFile('secrets.txt', 'not secret content');
        expect((await sessionGate(repo.path, 'task-1', 'before-edit')).decision).toBe('block');
    });
    it('does not overwrite an existing task or reset its initial observation', async () => {
        await createSession(repo.path, 'task-1', contract);
        await expect(createSession(repo.path, 'task-1', contract)).rejects.toThrow();
    });
    it('marks missing, stale and future heartbeats honestly', () => {
        const now = Date.now();
        expect(monitorHealth({ monitor: { status: 'running', heartbeatAt: new Date(now - 20000).toISOString() } }, now)).toBe('stale');
        expect(monitorHealth({ monitor: { status: 'running', heartbeatAt: new Date(now + 20000).toISOString() } }, now)).toBe('stale');
        expect(monitorHealth({ monitor: { status: 'running', heartbeatAt: new Date(now).toISOString() } }, now)).toBe('active');
    });
    it('runs one foreground watcher and marks graceful shutdown as stopped', async () => {
        await createSession(repo.path, 'task-1', contract);
        const controller = new AbortController();
        let ready!: () => void;
        const started = new Promise<void>(resolve => { ready = resolve; });
        const watching = watchSession(repo.path, 'task-1', controller.signal, () => ready());
        await started;
        expect(monitorHealth(await loadSession(repo.path, 'task-1'))).toBe('active');
        await expect(watchSession(repo.path, 'task-1', new AbortController().signal)).rejects.toThrow();
        controller.abort();
        await watching;
        expect(monitorHealth(await loadSession(repo.path, 'task-1'))).toBe('stopped');
    });
    it('records watcher errors without continuing to claim active monitoring', async () => {
        await createSession(repo.path, 'task-1', contract);
        await expect(watchSession(repo.path, 'task-1', new AbortController().signal, () => { throw new Error('consumer failed'); })).rejects.toThrow();
        expect(monitorHealth(await loadSession(repo.path, 'task-1'))).toBe('error');
    });
    it('retains the original snapshot when the Git index changes', async () => {
        const original = await createSession(repo.path, 'task-1', contract);
        await repo.writeFile('src/app.ts', 'new staged content');
        await repo.git('add', 'src/app.ts');
        const observed = await observeSession(repo.path, 'task-1');
        expect(observed.initial.digest).toBe(original.initial.digest);
        expect(observed.observation.changedPaths).toContain('src/app.ts');
        await expect(loadSession(repo.path, 'task-1')).resolves.toBeDefined();
    });
    it('refuses expired decisions and retains declined status without a verified claim', async () => {
        await createSession(repo.path, 'task-1', contract);
        await recordDecision(repo.path, 'task-1', 'declined');
        expect(await sessionGate(repo.path, 'task-1', 'before-finish')).toMatchObject({ decision: 'allow', verification: 'not-verified' });
        const path = join(repo.path, '.safe-change/sessions/task-1/state.json');
        const state = JSON.parse(await readFile(path, 'utf8'));
        state.createdAt = new Date(Date.now() - 10000).toISOString();
        state.expiresAt = new Date(Date.now() - 1000).toISOString();
        await writeFile(path, JSON.stringify(state));
        await expect(recordDecision(repo.path, 'task-1', 'now')).rejects.toThrow('expired');
        expect((await sessionGate(repo.path, 'task-1', 'before-edit')).decision).toBe('block');
    });
    it('rejects a pre-existing update lock rather than losing concurrent state', async () => {
        await createSession(repo.path, 'task-1', contract);
        await writeFile(join(repo.path, '.safe-change/sessions/task-1/state.lock'), 'busy');
        await expect(observeSession(repo.path, 'task-1')).rejects.toThrow();
        expect((await loadSession(repo.path, 'task-1')).choice).toBe('awaiting-user');
    });
    it('rejects path traversal and invalid contract scope', async () => {
        await expect(createSession(repo.path, '../outside', contract)).rejects.toThrow();
        for (const path of ['../x', '/tmp/x', '.git/', '.safe-change/', 'src/../x', 'C:/x', 'src\\x', '**']) {
            expect(() => validateContract({ ...contract, allowedPaths: [path] })).toThrow();
        }
    });
    it('rejects unknown fields, duplicate requirements, and secret-shaped intent', () => {
        expect(() => validateContract({ ...contract, arbitrary: true })).toThrow();
        expect(() => validateContract({ ...contract, requirements: [contract.requirements[0], contract.requirements[0]] })).toThrow();
        expect(() => validateContract({ ...contract, intent: 'password=abcdef123456789012345' })).toThrow();
    });
    it('does not follow symlinked state directories', async () => {
        const target = join(repo.path, 'external');
        await mkdir(target);
        await symlink(target, join(repo.path, '.safe-change'), process.platform === 'win32' ? 'junction' : 'dir');
        await expect(createSession(repo.path, 'task-1', contract)).rejects.toThrow();
    });
    it('rejects corrupt state instead of silently resetting consent', async () => {
        await createSession(repo.path, 'task-1', contract);
        await writeFile(join(repo.path, '.safe-change/sessions/task-1/state.json'), '{}');
        await expect(loadSession(repo.path, 'task-1')).rejects.toThrow();
    });
    it('blocks after a branch switch and does not reuse expired consent', async () => {
        await createSession(repo.path, 'task-1', contract);
        await recordDecision(repo.path, 'task-1', 'before-finish');
        await repo.git('switch', '-c', 'another-task');
        expect((await sessionGate(repo.path, 'task-1', 'before-edit')).decision).toBe('block');
    });
    it('does not silently run project commands during observation', async () => {
        await repo.createConfig([{ name: 'test', executable: process.execPath, args: ['-e', "require('fs').writeFileSync('executed','yes')"] }]);
        await createSession(repo.path, 'task-1', contract);
        await observeSession(repo.path, 'task-1');
        await expect(readFile(join(repo.path, 'executed'))).rejects.toThrow();
    });
});
