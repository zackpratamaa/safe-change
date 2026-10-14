# Antigravity Adapter Specification and Test Plan

> Historical research/design snapshot, not current operational instructions or live-runtime certification. For current behavior use [Verification integrity](verification-integrity.md), [MCP setup](mcp-setup.md), and the [runtime evidence matrix](runtime-verification.md). Earlier phase/test-count statements below describe that snapshot.

Verified Status:
"Candidate adapter; filesystem packaging validated; Antigravity runtime discovery not independently verified."

Current Phase:
Milestone C.3 (Isolated Antigravity Adapter Prototype). No production installer, no global installer, and no runtime discovery claims are implemented.

---

## 1. Architecture

The Antigravity adapter prototype provides an isolated, deterministic filesystem bridge between the canonical safe-change Agent Skill and the project-level skill discovery layout expected by Antigravity:

- **Single Canonical Source**: All operational instructions reside solely in `skills/safe-change/SKILL.md`.
- **Target Layout**: The adapter replicates the canonical skill into `plugins/antigravity/skills/safe-change/SKILL.md`.
- **Packaging Model**: Pure file-copy packaging. The adapter uses regular files only and forbids symbolic links, NTFS directory junctions, and hard links.
- **Independence**: The adapter is strictly self-contained within `plugins/antigravity/`. It shares no state with other potential agent adapters.

---

## 2. Source-to-Bundle Flow

The flow from the canonical skill definition to the bundled adapter is strictly unidirectional and deterministic:

```
[Canonical Source]
skills/safe-change/SKILL.md
       │
       ▼ (1. Read and validate frontmatter, emoji, paths)
[Integrity Check]
       │
       ▼ (2. Calculate SHA-256 hash)
[Hash Computation]
       │
       ▼ (3. Deterministic byte copy to plugins/antigravity/skills/safe-change/SKILL.md)
[Bundled Adapter]
       │
       ▼ (4. Automated verification: Buffer comparison & hash match)
[Test Suite Assertion]
```

If the canonical skill is modified, the automated drift detection test immediately fails until the bundled file is regenerated to match.

---

## 3. Directory Structure

The prototype implements the minimal, isolated directory structure for Antigravity:

```
plugins/
└── antigravity/
    ├── README.md
    └── skills/
        └── safe-change/
            └── SKILL.md
```

### Manifest Schema Policy
`plugin.json` is intentionally omitted from this prototype:
- As documented in `docs/agent-compatibility.md`, Antigravity documentation notes hierarchical customization loading, but the formal schema and mandatory keys for a standalone plugin manifest have not been officially established or publicly documented.
- Per repository rules, manifest formats must never be guessed.
- The prototype focuses strictly on verified skill directory discovery (`.agents/skills/safe-change/SKILL.md`).

---

## 4. Hash and Drift Strategy

To maintain complete synchronization between the canonical definition and distributed adapter:
1. **Canonical Hash Baseline**: Tests compute the SHA-256 digest of `skills/safe-change/SKILL.md`.
2. **Bundle Hash Verification**: Tests compute the SHA-256 digest of `plugins/antigravity/skills/safe-change/SKILL.md`.
3. **Drift Detection**: Any discrepancy between the canonical hash and bundled hash is treated as an immediate regression.
4. **Idempotence**: Repeated bundle generation on identical inputs produces identical byte-for-byte outputs with zero jitter or metadata timestamps.

---

## 5. Test Strategy

The adapter behavior is verified through automated integration tests (`tests/integration/antigravity-adapter.test.ts`):
- **Byte-for-Byte Identity**: Buffers are compared using `Buffer.compare` to guarantee zero transmission alteration.
- **SHA-256 Matching**: Checksums must match exactly.
- **Deterministic Regeneration**: Multiple generation passes must produce bitwise-identical results.
- **Negative Drift Detection**: Simulating content differences triggers immediate test failure.
- **Frontmatter Parsing**: Validates that YAML frontmatter delimiters (`---`) and keys (`name: safe-change`, `description`) remain valid across line endings.
- **Sanitization Checks**: Rejection of emojis, private local file URLs, machine-specific user home paths, and cloud synchronization paths.
- **Filesystem Safety**: Rejection of symbolic links, directory junctions, and path traversal attempts.
- **Isolation Checks**: Verifies that unrelated plugin directories (e.g. `plugins/claude-code`, `plugins/cursor`, `plugins/codex`) do not exist.
- **Home Protection**: Tests must never write to the real user home directory outside isolated temporary fixture directories.
- **Cleanup Diagnostics**: Temporary directories used during testing are verified to be cleanly removed, and failures are reported with root-cause diagnostics.

---

## 6. Fixture Limitations

The successful execution of tests in `tests/integration/antigravity-adapter.test.ts` proves filesystem properties only:
1. It proves that the bundle can be packaged correctly on disk.
2. It proves that file hashes, path boundaries, and formatting adhere to safe-change requirements.
3. **Crucial Limitation**: It does NOT prove that an Antigravity runtime instance (IDE, daemon, or extension) will discover, load, or invoke the skill. Filesystem compliance is a necessary precondition, but not proof of runtime interoperability.

---

## 7. Runtime Discovery Test Plan

To verify runtime discovery in future milestones without making premature claims, the following empirical test protocol is planned:

### Phase 1: Environment Setup
- Deploy a supported version of Antigravity IDE in a clean test virtual machine or isolated container.
- Record the exact runtime version, operating system, and build number.

### Phase 2: Project Placement
- Initialize a test Git repository containing `.agents/skills/safe-change/SKILL.md` (copied from the adapter bundle).
- Ensure the `safe-change` CLI binary is available on PATH.

### Phase 3: Prompt Execution
- Issue user prompts designed to trigger safe-change (e.g. "Save a safety baseline before modifying this function").
- Monitor agent session logs, context window injections, and tool invocations.

### Phase 4: Evidence Recording
- Verify that Antigravity indexes the skill name and description into its system prompt.
- Verify that when triggered, Antigravity activates the skill body and executes `safe-change save` or `safe-change check`.
- Document all observations, terminal transcripts, and version numbers in a reproducible validation report.

Until this four-phase protocol is executed and documented, the status remains:
"Filesystem adapter packaging validated; Antigravity runtime discovery not independently verified."

---

## 8. Required Antigravity Evidence Before Production Support

Production-level integration and installer release for Antigravity will require:
1. Public canonical documentation URL confirming plugin and skill discovery specifications.
2. Successful execution of the Runtime Discovery Test Plan with reproducible logs.
3. Empirical confirmation of session reload behavior (whether dynamic folder addition requires IDE window reload).
4. Formal review and approval of the installer architecture.

---

## 9. Security Boundary

The Antigravity adapter adheres to the repository's strict security boundaries:
- **No Path Escapes**: Target directories must resolve strictly within the designated repository or fixture root.
- **Zero-Trust Symlinks**: Symlinks, junctions, and hard links are prohibited.
- **No Home Directory Root**: The user home directory root itself is forbidden as an installation target.
- **No Shell or Dotfile Mutation**: The adapter does not write to `.bashrc`, `.zshrc`, PowerShell profiles, or unrelated dotfiles.
- **No Network Activity**: The adapter performs purely local filesystem operations with no outbound HTTP requests, telemetry, or remote dependency downloads.

---

## 10. Known Unknowns

1. **Antigravity Public Specification**: Official specifications remain private to local runtime environments.
2. **Reload Mechanics**: Whether adding a skill while Antigravity is running triggers dynamic indexing or requires restarting the IDE.
3. **Plugin Manifest Schema**: The exact schema for `plugin.json` in Antigravity is unverified.
4. **Context Window Overhead**: Impact on context window limits when safe-change is installed alongside multiple custom skills.

---

## 11. Explicit Deferred Work

The following features and integrations are explicitly deferred from this milestone:
1. Production installer CLI commands (`safe-change install`, `safe-change update`, `safe-change uninstall`).
2. Global installation into `~/.gemini/config/`.
3. Standalone `plugin.json` manifest generation.
4. Creation of adapters for Claude Code, Cursor, Codex, Cline, Kimi Code, Amp, OpenCode, or Gemini CLI.
5. Official plugin marketplace publication or registration.
6. Automated merging into shared instruction files (`AGENTS.md`, `CLAUDE.md`).
