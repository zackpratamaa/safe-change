# Documentation status and source contract

## Current operational references

- [README](../README.md) and [Guide](../GUIDE.md): entry points, setup and CLI use.
- [Verification integrity](verification-integrity.md): strict gate, snapshot
  binding, oracle review, freshness, and coverage limits.
- [MCP setup](mcp-setup.md): actual five-tool stdio contract; no universal vendor
  configuration-path guarantee.
- [Integrity Core](integrity-core.md), [Enforcement Core](enforcement-core.md),
  [Enterprise assessment](enterprise-enforcement.md): separate implemented controls.
- [Verifiable execution](verifiable-execution.md) and
  [architecture](verifiable-execution-architecture.md): actual command syntax,
  provider limitations, optional rerun/signing, and external orchestration.
- [Operations runbook](operations-runbook.md), [rules](rules.md),
  [dashboard](dashboard.md), [enterprise skill policy](enterprise-skill-policy.md):
  operational contracts, not proof of universal correctness.
- [Runtime evidence matrix](runtime-verification.md): filesystem validation is
  separate from per-agent MCP and skill auto-invocation, which remain pending.
- [Security policy](../SECURITY.md): cooperative execution and configuration trust.

Current source features on main are not automatically included in an older npm
package. Check the installed release/commit. External vendor docs, configuration
formats, and live compatibility require separate current evidence.

## Historical research and design

These documents retain earlier reasoning with explicit historical notices:
agent-compatibility, antigravity-adapter, antigravity-fixture,
installer-architecture, technology-evaluation, rust-poc-results, and
rust-migration-plan. Their old phase/test-count claims are not current runtime
certification. ROADMAP is a milestone ledger, not proof that every feature is
composed into a mandatory end-to-end pipeline.

## Automatically checked invariants

`tests/unit/documentation-alignment.test.ts` checks:

1. CLI commands in executable Markdown fences correspond to actual CLI cases.
2. Local Markdown links exist and no machine-specific file URI is retained.
3. Current final-verification guides use strict checks.
4. Replay documentation uses the declared categories and marks reserved coverage.
5. Canonical skill and plugin copy are byte-identical, with correct save/strict
   status contracts.
6. JSON configuration examples parse without comments or invalid syntax.

These checks catch structural/source-contract drift. They do not prove that
every sentence is timeless, that external URLs remain current, or that all
third-party agent versions have been tested.