import { describe, expect, it } from 'vitest';
import { renderClaudeHook } from '../../src/session/hooks.js';
import type { GateResult } from '../../src/session/manager.js';
const base: GateResult = { decision: 'ask', reason: 'Choose verification timing.', choice: 'awaiting-user', monitoring: 'stopped', verification: 'not-verified', requirementMappings: [] };
describe('experimental Claude hook output protocol', () => {
    it('asks the host before editing but does not record a task decision', () => {
        expect(renderClaudeHook(base, 'before-edit')).toMatchObject({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' } });
        expect(base.choice).toBe('awaiting-user');
    });
    it('denies blocked edits and blocks completion without evidence', () => {
        expect(renderClaudeHook({ ...base, decision: 'block' }, 'before-edit')).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
        expect(renderClaudeHook(base, 'before-finish')).toMatchObject({ decision: 'block' });
    });
    it('does not interfere with allowed operations', () => { expect(renderClaudeHook({ ...base, decision: 'allow' }, 'before-edit')).toEqual({}); });
});
