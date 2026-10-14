import { lstat, readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { getRepositoryRoot } from '../git/inspector.js';
import { renderClaudeHook } from '../session/hooks.js';
import { ExitCodes, type OutputFormat } from '../types/index.js';
import { redactSecrets } from '../security/secret-redactor.js';
import { createSession, loadSession, monitorHealth, observeSession, recordDecision, sessionGate, watchSession, type TaskSession, type VerificationChoice } from '../session/manager.js';
function summary(state: TaskSession): object {
    return { id: state.id, createdAt: state.createdAt, expiresAt: state.expiresAt, contract: state.contract, choice: state.choice, decisionAt: state.decisionAt, monitoring: monitorHealth(state), observation: state.observation, initialSourceDigest: state.initial.digest, note: 'Observation is not verification. This local workflow record is not authenticated approval.' };
}
export async function runSession(options: {
    values: string[];
    file?: string;
    format: OutputFormat;
}): Promise<number> {
    const [action, id, point, ...extra] = options.values;
    const root = await getRepositoryRoot(process.cwd()).catch(() => null);
    if (!root) {
        process.stderr.write('Not a Git repository; session gate unavailable.\n');
        return action === 'hook' ? 2 : ExitCodes.NOT_GIT_REPO;
    }
    const output = (value: unknown) => process.stdout.write(`${JSON.stringify(value, null, options.format === 'json' ? 2 : 0)}\n`);
    try {
        if (!id || extra.length)
            throw new Error('Usage: session start|status|decide|observe|watch|gate <task-id> [before-edit|before-finish].');
        if (point && !['gate', 'hook'].includes(action ?? ''))
            throw new Error('Unexpected argument. Choice flags and positional self-approval are not accepted.');
        switch (action) {
            case 'start': {
                if (!options.file)
                    throw new Error('session start requires --file <change-contract.json>.');
                const stat = await lstat(options.file);
                if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536)
                    throw new Error('Contract must be a regular file no larger than 64 KiB.');
                output(summary(await createSession(root, id, JSON.parse(await readFile(options.file, 'utf8')))));
                return ExitCodes.OK;
            }
            case 'status':
                output(summary(await loadSession(root, id)));
                return ExitCodes.OK;
            case 'observe':
                output(summary(await observeSession(root, id)));
                return ExitCodes.OK;
            case 'decide': {
                // Deliberately no --yes, environment decision, JSON setter or MCP grant tool.
                // A same-user unrestricted agent can still emulate a TTY or edit state: not an OS trust boundary.
                if (!process.stdin.isTTY || !process.stdout.isTTY)
                    throw new Error('A person must use an interactive terminal. No non-interactive consent setter is provided.');
                const state = await loadSession(root, id);
                const prompt = createInterface({ input: process.stdin, output: process.stdout });
                let choice: string;
                try {
                    process.stdout.write(`Task ${id}: ${state.contract.intent}\nObservation can remain active only while the watcher runs.\n`);
                    choice = (await prompt.question('Verification choice [now / before-finish / declined]: ')).trim();
                }
                finally {
                    prompt.close();
                }
                if (!['now', 'before-finish', 'declined'].includes(choice!))
                    throw new Error('No valid decision recorded. Silence is not consent.');
                output(summary(await recordDecision(root, id, choice as Exclude<VerificationChoice, 'awaiting-user'>)));
                return ExitCodes.OK;
            }
            case 'hook':
            case 'gate': {
                if (point !== 'before-edit' && point !== 'before-finish')
                    throw new Error('gate requires before-edit or before-finish.');
                const result = await sessionGate(root, id, point);
                output(action === 'hook' ? renderClaudeHook(result, point) : result);
                return action === 'hook' || result.decision === 'allow' ? ExitCodes.OK : ExitCodes.NEW_FAILURE;
            }
            case 'watch': {
                const controller = new AbortController();
                const stop = () => controller.abort();
                process.once('SIGINT', stop);
                process.once('SIGTERM', stop);
                try {
                    await watchSession(root, id, controller.signal, state => output({ id: state.id, monitoring: monitorHealth(state), choice: state.choice, observation: state.observation }));
                }
                finally {
                    process.removeListener('SIGINT', stop);
                    process.removeListener('SIGTERM', stop);
                }
                return ExitCodes.OK;
            }
            default: throw new Error('Unknown session action.');
        }
    }
    catch (error) {
        process.stderr.write(`${redactSecrets(error instanceof Error ? error.message : String(error)).text}\n`);
        return action === 'hook' ? 2 : ExitCodes.CONFIG_ERROR;
    }
}
