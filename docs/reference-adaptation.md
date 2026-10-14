# Reference adaptation ledger

Nine reference repositories were cloned for read-only research outside the product working tree. Their installers and hooks were not executed. The Safe-Change implementation is original: no reference source, skill text, assets, vendored frameworks or new framework dependencies are included. This ledger records inspiration, not endorsement, integration certification, legal clearance or proof of novelty/patentability.

| Source snapshot | Commit | License inspected | Relevant concept |
|---|---|---|---|
| [obra/superpowers](https://github.com/obra/superpowers/tree/bb92a77741419a4ab5f06e711a283343f1ada0c3) | `bb92a7774141` | MIT | Fresh evidence, startup/compaction context restoration |
| [anthropics/skills](https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44) | `dbd4588f9e10` | mixed; frontend-design Apache-2.0 | Specialized quality guidance; context-sensitive design review |
| [bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD/tree/8f0d50e1817fdd8fcf05a20c524218222d13cd8d) | `8f0d50e1817f` | MIT; trademark notice | Separate decisions, visual contracts and behavioral UX contracts |
| [affaan-m/ECC](https://github.com/affaan-m/ECC/tree/b92f181b3b748d1abbc2afd94af6aa7d8c8fca29) | `b92f181b3b74` | MIT | Lifecycle hooks, fail-closed incomplete input, platform limits |
| [github/spec-kit](https://github.com/github/spec-kit/tree/96774bc52fd7dccc7185791e1cac7572b9e09dea) | `96774bc52fd7` | MIT | Requirements-to-check traceability and unrequested-work detection |
| [ruvnet/ruflo](https://github.com/ruvnet/ruflo/tree/55e2c9011c20d25e347a175427ca8084dacde40c) | `55e2c9011c20` | MIT | Separate autonomy, confirmation and human stop controls |
| [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec/tree/9111a7654d7800391459431fff4eaf66e33a3d2e) | `9111a7654d78` | MIT | Scoped change contract and explicit repository boundaries |
| [code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent/tree/cd31c31b6d00f84b1e4f5a2b4a2db4b116fbfc90) | `cd31c31b6d00` | SUL-1.0; restricted | Concept-only review of stale edits, continuation and instruction/enforcement separation |
| [wshobson/agents](https://github.com/wshobson/agents/tree/46891e7e60da0e52baf1050b7b6391b64e84c6d9) | `46891e7e60da` | MIT; external plugins separate | Capability matrix and modular, bounded quality evaluation |

## Delivery boundary

Implemented in this increment: literal change contracts, requirement/check declarations, expiring task-timing choices, durable local state, Git-visible observation, heartbeat health, conservative scope/oracle gates, binding to the existing verification engine, interactive choice CLI and an experimental Claude-compatible hook output adapter. See [task sessions](task-sessions.md).

Deferred: live per-IDE certification and automatic hook installation, authenticated native consent UI, cross-session watcher supervision, specialized maintainability/security/license analyzers, DESIGN/EXPERIENCE contract parsers, browser-based UI/UX evaluation, performance/cost budgets, learned scoring, multi-agent orchestration and Meta Model API integration. Existing Safe-Change components remain independent and are not relabeled as these new modules.

## License handling

MIT sources require retained copyright/license notices if substantial material is incorporated. Anthropic's repository has mixed terms: inspect each selected file; the reviewed frontend-design skill is Apache-2.0, while document skills are described as source-available. OmO's inspected source is under Sustainable Use License with use/distribution restrictions: no code or substantive text was copied or relicensed into Safe-Change. Third-party components can have separate terms. Any future reuse needs a file-level license and attribution review before merge.

Safe-Change remains AGPL-3.0-only. Reference popularity and README claims are not runtime evidence. Source review was targeted, not a complete security audit of nine repositories.
