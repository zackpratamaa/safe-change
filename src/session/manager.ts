/** Original Safe-Change implementation. Reference provenance: docs/reference-adaptation.md. */
import { lstat, mkdir, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FileEntry } from '../types/index.js';
import { getFileEntries, getGitState, getRepositoryRoot } from '../git/inspector.js';
import { stableDigest } from '../integrity/hash.js';
import { sourceDigest, bindingsMatch, captureVerificationBinding } from '../integrity/verification-binding.js';
import { loadBaseline } from '../baseline/manager.js';
import { loadConfig } from '../config/loader.js';
import { redactSecrets } from '../security/secret-redactor.js';
import { assertSafeIdentifier } from '../security/path-boundary.js';
export interface ChangeContract {
    version: 1;
    intent: string;
    allowedPaths: string[];
    protectedPaths: string[];
    requirements: {
        id: string;
        description: string;
        checks: string[];
    }[];
    nonGoals: string[];
}
export type VerificationChoice = 'awaiting-user' | 'now' | 'before-finish' | 'declined';
interface Snapshot {
    head: string | null;
    branch: string | null;
    files: Record<string, FileEntry>;
    digest: string;
}
export interface TaskSession {
    version: 1;
    id: string;
    repositoryRoot: string;
    createdAt: string;
    expiresAt: string;
    contract: ChangeContract;
    choice: VerificationChoice;
    decisionAt: string | null;
    initial: Snapshot;
    observation: {
        at: string;
        digest: string;
        changedPaths: string[];
        outOfScope: string[];
        protectedChanges: string[];
        headChanged: boolean;
    };
    monitor: {
        status: 'stopped' | 'running' | 'error';
        heartbeatAt: string | null;
    };
}
export type GatePoint = 'before-edit' | 'before-finish';
export interface GateResult {
    decision: 'allow' | 'ask' | 'block';
    reason: string;
    choice: VerificationChoice;
    monitoring: ReturnType<typeof monitorHealth>;
    verification: 'verified' | 'not-verified';
    requirementMappings: {
        id: string;
        checksDeclared: string[];
    }[];
}
const MAX_STATE_BYTES = 16 * 1024 * 1024;
const TTL_MS = 24 * 60 * 60 * 1000;
const CHOICES = ['awaiting-user', 'now', 'before-finish', 'declined'];
function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Expected an object.');
    return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]): void {
    if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !(key in value)))
        throw new Error('Missing or unknown fields.');
}
function text(value: unknown, max = 2000): string {
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value) || redactSecrets(value).findings.length)
        throw new Error('Invalid or secret-shaped text; do not include credentials.');
    return value;
}
function list(value: unknown, max = 128): unknown[] {
    if (!Array.isArray(value) || value.length > max)
        throw new Error('Invalid or oversized list.');
    return value;
}
function pathName(value: unknown): string {
    const path = text(value, 512);
    const parts = path.replace(/\/$/, '').split('/');
    if (/[:\\*?\[\]{}]/.test(path) || parts.some(p => !p || p === '.' || p === '..') || ['.git', '.safe-change'].includes(parts[0]!))
        throw new Error('Expected a literal repository-relative path outside internal state.');
    return path;
}
export function validateContract(value: unknown): ChangeContract {
    const v = object(value);
    exact(v, ['version', 'intent', 'allowedPaths', 'protectedPaths', 'requirements', 'nonGoals']);
    if (v['version'] !== 1)
        throw new Error('Unsupported change contract version.');
    const allowedPaths = list(v['allowedPaths']).map(pathName);
    if (!allowedPaths.length)
        throw new Error('At least one allowed path is required.');
    const requirements = list(v['requirements']).map(raw => {
        const r = object(raw);
        exact(r, ['id', 'description', 'checks']);
        return { id: assertSafeIdentifier(text(r['id'], 128), 'Requirement id'), description: text(r['description']), checks: list(r['checks']).map(c => text(c, 128)) };
    });
    if (!requirements.length || new Set(requirements.map(r => r.id)).size !== requirements.length)
        throw new Error('Unique requirements are required.');
    return { version: 1, intent: text(v['intent']), allowedPaths, protectedPaths: list(v['protectedPaths']).map(pathName), requirements, nonGoals: list(v['nonGoals']).map(t => text(t)) };
}
function inScope(path: string, scopes: string[]): boolean {
    return scopes.some(scope => scope.endsWith('/') ? path.startsWith(scope) : scope === path);
}
function snapshotDigest(snapshot: Omit<Snapshot, 'digest'>): string {
    return stableDigest({ head: snapshot.head, branch: snapshot.branch, files: sourceDigest(snapshot.files) });
}
async function capture(root: string): Promise<Snapshot> {
    const before = await getGitState(root);
    const files = await getFileEntries(root);
    const after = await getGitState(root);
    if (before.headCommit !== after.headCommit || before.headBranch !== after.headBranch)
        throw new Error('Revision changed while observing.');
    const base = { head: after.headCommit, branch: after.headBranch, files };
    return { ...base, digest: snapshotDigest(base) };
}
async function directory(path: string, create: boolean): Promise<void> {
    if (create)
        await mkdir(path).catch(error => { if (error.code !== 'EEXIST')
            throw error; });
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink())
        throw new Error('Session storage must not be a symlink or non-directory.');
}
async function sessionDir(root: string, id: string, create = false): Promise<string> {
    assertSafeIdentifier(id, 'Session id');
    // No recursive mkdir: each ancestor is checked before traversing into it.
    const state = join(root, '.safe-change');
    await directory(state, create);
    const sessions = join(state, 'sessions');
    await directory(sessions, create);
    const target = join(sessions, id);
    await directory(target, create);
    return target;
}
async function regularFile(path: string): Promise<void> {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_STATE_BYTES)
        throw new Error('Invalid, symlinked or oversized session file.');
}
function timestamp(value: unknown): string {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
        throw new Error('Invalid timestamp.');
    return value;
}
function validateState(raw: unknown, root: string, id: string): TaskSession {
    const v = object(raw);
    exact(v, ['version', 'id', 'repositoryRoot', 'createdAt', 'expiresAt', 'contract', 'choice', 'decisionAt', 'initial', 'observation', 'monitor']);
    if (v['version'] !== 1 || v['id'] !== id || v['repositoryRoot'] !== root || !CHOICES.includes(String(v['choice'])))
        throw new Error('Session identity or choice mismatch.');
    validateContract(v['contract']);
    const created = Date.parse(timestamp(v['createdAt']));
    const expires = Date.parse(timestamp(v['expiresAt']));
    if (expires <= created || expires - created > TTL_MS)
        throw new Error('Invalid session lifetime.');
    if (v['decisionAt'] !== null)
        timestamp(v['decisionAt']);
    if ((v['choice'] === 'awaiting-user') !== (v['decisionAt'] === null))
        throw new Error('Choice has no matching decision timestamp.');
    const initial = object(v['initial']);
    exact(initial, ['head', 'branch', 'files', 'digest']);
    for (const key of ['head', 'branch'])
        if (initial[key] !== null && typeof initial[key] !== 'string')
            throw new Error('Invalid Git identity.');
    const files = object(initial['files']);
    for (const [name, entry] of Object.entries(files)) {
        pathName(name);
        const e = object(entry);
        exact(e, ['tracked', 'status', 'worktreeHash', 'indexHash']);
        if (typeof e['tracked'] !== 'boolean' || !['clean', 'modified', 'staged', 'deleted', 'untracked'].includes(String(e['status'])))
            throw new Error('Invalid file entry.');
        for (const key of ['worktreeHash', 'indexHash'])
            if (e[key] !== null && (typeof e[key] !== 'string' || !/^(?:sha256:)?[a-f0-9]{40,64}$/.test(e[key] as string)))
                throw new Error('Invalid file hash.');
    }
    if (initial['digest'] !== snapshotDigest(initial as unknown as Snapshot))
        throw new Error('Initial observation digest mismatch.');
    const observation = object(v['observation']);
    exact(observation, ['at', 'digest', 'changedPaths', 'outOfScope', 'protectedChanges', 'headChanged']);
    timestamp(observation['at']);
    if (typeof observation['digest'] !== 'string' || typeof observation['headChanged'] !== 'boolean')
        throw new Error('Invalid observation.');
    for (const key of ['changedPaths', 'outOfScope', 'protectedChanges'])
        list(observation[key], 100000).map(pathName);
    const monitor = object(v['monitor']);
    exact(monitor, ['status', 'heartbeatAt']);
    if (!['running', 'stopped', 'error'].includes(String(monitor['status'])))
        throw new Error('Invalid monitor status.');
    if (monitor['heartbeatAt'] !== null)
        timestamp(monitor['heartbeatAt']);
    return raw as TaskSession;
}
async function canonicalRoot(root: string): Promise<string> {
    return realpath(await getRepositoryRoot(root));
}
export async function loadSession(root: string, id: string): Promise<TaskSession> {
    root = await canonicalRoot(root);
    const dir = await sessionDir(root, id);
    const path = join(dir, 'state.json');
    await regularFile(path);
    return validateState(JSON.parse(await readFile(path, 'utf8')), root, id);
}
async function locked<T>(root: string, id: string, action: (dir: string) => Promise<T>): Promise<T> {
    const dir = await sessionDir(root, id, true);
    const path = join(dir, 'state.lock');
    const lock = await open(path, 'wx', 0o600);
    try {
        return await action(dir);
    }
    finally {
        await lock.close();
        await unlink(path);
    }
}
async function persist(dir: string, state: TaskSession): Promise<void> {
    const target = join(dir, 'state.json');
    try {
        await regularFile(target);
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
            throw error;
    }
    const temp = join(dir, `${randomUUID()}.tmp`);
    const handle = await open(temp, 'wx', 0o600);
    try {
        await handle.writeFile(`${JSON.stringify(state)}\n`);
        await handle.close();
        await rename(temp, target);
    }
    finally {
        await handle.close().catch(() => undefined);
        await unlink(temp).catch(() => undefined);
    }
}
export async function createSession(root: string, id: string, contract: unknown): Promise<TaskSession> {
    root = await canonicalRoot(root);
    const validated = validateContract(contract);
    return locked(root, id, async (dir) => {
        try {
            await lstat(join(dir, 'state.json'));
            throw new Error('Session already exists; use a new task id.');
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                throw error;
        }
        const initial = await capture(root);
        const now = new Date().toISOString();
        const state: TaskSession = { version: 1, id, repositoryRoot: root, createdAt: now, expiresAt: new Date(Date.parse(now) + TTL_MS).toISOString(), contract: validated, choice: 'awaiting-user', decisionAt: null, initial,
            observation: { at: now, digest: initial.digest, changedPaths: [], outOfScope: [], protectedChanges: [], headChanged: false }, monitor: { status: 'stopped', heartbeatAt: null } };
        await persist(dir, state);
        return state;
    });
}
/** A workflow record, NOT an authenticated approval. Never expose this as an agent self-approval tool. */
export async function recordDecision(root: string, id: string, choice: Exclude<VerificationChoice, 'awaiting-user'>): Promise<TaskSession> {
    root = await canonicalRoot(root);
    if (!['now', 'before-finish', 'declined'].includes(choice))
        throw new Error('Invalid choice.');
    return locked(root, id, async (dir) => {
        const state = await loadSession(root, id);
        if (Date.parse(state.expiresAt) <= Date.now())
            throw new Error('Session expired; start a new task.');
        state.choice = choice;
        state.decisionAt = new Date().toISOString();
        await persist(dir, state);
        return state;
    });
}
export function monitorHealth(state: {
    monitor: {
        status: string;
        heartbeatAt: string | null;
    };
}, now = Date.now()): 'active' | 'stale' | 'stopped' | 'error' {
    if (state.monitor.status !== 'running')
        return state.monitor.status === 'error' ? 'error' : 'stopped';
    const age = now - Date.parse(state.monitor.heartbeatAt ?? '');
    return Number.isFinite(age) && age >= 0 && age <= 15000 ? 'active' : 'stale';
}
export async function observeSession(root: string, id: string, monitor?: 'running' | 'stopped' | 'error'): Promise<TaskSession> {
    root = await canonicalRoot(root);
    return locked(root, id, async (dir) => {
        const state = await loadSession(root, id);
        const current = await capture(root);
        const names = new Set([...Object.keys(state.initial.files), ...Object.keys(current.files)]);
        const changedPaths = [...names].filter(name => stableDigest(state.initial.files[name] ?? null) !== stableDigest(current.files[name] ?? null)).sort();
        const protectedChanges = changedPaths.filter(name => inScope(name, state.contract.protectedPaths) || /(^|\/)(tests?|__tests__|specs?)(\/|$)|\.(test|spec)\.[^/]+$|(^|\/)(package(?:-lock)?\.json|.*lock.*|.*config\.[^/]+)$|^\.github\//i.test(name));
        state.observation = { at: new Date().toISOString(), digest: current.digest, changedPaths, outOfScope: changedPaths.filter(name => !inScope(name, state.contract.allowedPaths)), protectedChanges, headChanged: state.initial.head !== current.head || state.initial.branch !== current.branch };
        if (monitor)
            state.monitor = { status: monitor, heartbeatAt: new Date().toISOString() };
        await persist(dir, state);
        return state;
    });
}
async function currentVerification(root: string, state: TaskSession): Promise<boolean> {
    try {
        const path = join(root, '.safe-change/last-verification-summary.json');
        await regularFile(path);
        const summary = JSON.parse(await readFile(path, 'utf8'));
        if (summary.schemaVersion !== 1 || summary.state !== 'verified' || Date.parse(summary.generatedAt) < Date.parse(state.createdAt) || !Number.isFinite(Date.parse(summary.generatedAt)) || Date.parse(summary.generatedAt) > Date.now())
            return false;
        const config = await loadConfig(root);
        const baseline = await loadBaseline(root);
        if (!baseline || sourceDigest(baseline.files) !== sourceDigest(state.initial.files) || baseline.git.headCommit !== state.initial.head || baseline.git.headBranch !== state.initial.branch)
            return false;
        const binding = await captureVerificationBinding(root, config, baseline);
        if (!bindingsMatch(summary.verificationBinding, binding))
            return false;
        // Explicit mappings must exist and pass. A mapping is a declaration, not proof of full requirement coverage.
        if (!Array.isArray(summary.checks))
            return false;
        return state.contract.requirements.every(r => r.checks.length > 0 && r.checks.every(name => summary.checks.some((check: {
            name: string;
            exitCode: number;
            timedOut: boolean;
            outputBlocked: boolean;
        }) => check.name === name && check.exitCode === 0 && !check.timedOut && !check.outputBlocked)));
    }
    catch {
        return false;
    }
}
export async function sessionGate(root: string, id: string, point: GatePoint): Promise<GateResult> {
    root = await canonicalRoot(root);
    if (!['before-edit', 'before-finish'].includes(point))
        throw new Error('Unknown gate point.');
    const state = await observeSession(root, id);
    const verified = await currentVerification(root, state);
    const base = { choice: state.choice, monitoring: monitorHealth(state), verification: verified ? 'verified' as const : 'not-verified' as const, requirementMappings: state.contract.requirements.map(r => ({ id: r.id, checksDeclared: r.checks })) };
    const result = (decision: GateResult['decision'], reason: string): GateResult => ({ ...base, decision, reason });
    if (Date.parse(state.expiresAt) <= Date.now())
        return result('block', 'Session expired; consent must not carry into a new task.');
    if (state.observation.headChanged)
        return result('block', 'Branch or revision changed; start a new task.');
    if (state.observation.outOfScope.length)
        return result('block', 'Changes exceed the declared scope; request a reviewed contract.');
    if (state.observation.protectedChanges.length)
        return result('block', 'Protected verification inputs changed; independent review required. Do not silently replace the baseline.');
    if (state.choice === 'awaiting-user')
        return result('ask', 'Safe-Change observes this task. Verify now or before finishing? No silence-as-consent.');
    if (state.choice === 'declined')
        return result('allow', 'Verification declined for this task; observation remains separate. Do not claim verified.');
    if (point === 'before-finish' && !verified)
        return result('ask', 'Current task verification is missing or stale. Run the configured checks before claiming verification.');
    if (point === 'before-edit' && state.choice === 'now') {
        const baseline = await loadBaseline(root).catch(() => null);
        if (!baseline || sourceDigest(baseline.files) !== sourceDigest(state.initial.files))
            return result('block', 'Record the baseline before the first edit. Observation is not a test baseline.');
    }
    return result('allow', verified ? 'Current bound verification available; declared mapping is not universal coverage.' : 'Verification deferred; no claim of verified safety is permitted.');
}
/** Foreground observer: caller owns process lifetime. Never runs checks, edits code, or starts itself. */
export async function watchSession(root: string, id: string, signal: AbortSignal, onTick: (state: TaskSession) => void = () => undefined): Promise<void> {
    root = await canonicalRoot(root);
    const dir = await sessionDir(root, id);
    const path = join(dir, 'watch.lock');
    const lock = await open(path, 'wx', 0o600);
    try {
        while (!signal.aborted) {
            const state = await observeSession(root, id, 'running');
            onTick(state);
            if (Date.parse(state.expiresAt) <= Date.now())
                throw new Error('Session expired.');
            await new Promise<void>(resolve => {
                const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
                const timer = setTimeout(done, 2000);
                signal.addEventListener('abort', done, { once: true });
                if (signal.aborted)
                    done();
            });
        }
        await observeSession(root, id, 'stopped');
    }
    catch (error) {
        await observeSession(root, id, 'error').catch(() => undefined);
        throw error;
    }
    finally {
        await lock.close();
        await unlink(path);
    }
}
