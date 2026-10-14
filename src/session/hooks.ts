import type { GatePoint, GateResult } from './manager.js';
/** Claude-compatible output shape; protocol-tested only, not a live host certification. */
export function renderClaudeHook(result: GateResult, point: GatePoint): object {
    if (result.decision === 'allow')
        return {};
    const reason = `Safe-Change: ${result.reason} Workflow choice is not an operation approval. Monitoring: ${result.monitoring}.`;
    if (point === 'before-finish')
        return { decision: 'block', reason };
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: result.decision === 'ask' ? 'ask' : 'deny', permissionDecisionReason: reason } };
}
