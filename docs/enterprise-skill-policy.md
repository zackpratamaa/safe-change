# Enterprise Agent Skill Policy

safe-change ships one canonical safety contract and ten agent-specific profiles. The installer composes them deterministically at installation time.

## Architecture

- `skills/safe-change/SKILL.md` is the authoritative policy.
- `skills/safe-change/profiles/<agent>.md` contains only platform-specific activation, tool, discovery, and reporting constraints.
- Canonical policy takes precedence over every profile.
- The installed `SKILL.md` is the canonical document followed by a bounded profile section.
- The ownership manifest records the policy version plus canonical, profile, and composed SHA-256 values.
- Status checks compare installed bytes with the current composed output, so canonical or profile drift is detected.
- A missing profile preserves the legacy byte-for-byte canonical installation behavior.

## Assurance Modes

The policy defines Standard, High Assurance, and Incident modes. Profiles may raise the required mode but cannot lower it.

High Assurance is required for security, release, dependency, CI, installer, native, public API, and cross-platform work. Incident mode additionally requires evidence preservation, containment, and explicit residual-risk reporting.

## Microscopic Review

The policy requires review at syntax and token boundaries, including delimiters, operators, precedence, nullability, indentation, cleanup, timeout, concurrency, atomicity, serialization, compatibility, tests, documentation, and private-data exposure. Visual inspection is not sufficient where a parser, compiler, formatter, linter, test runner, package validator, or security tool is available.

## Fail-Closed Behavior

An agent must stop or downgrade its conclusion when evidence is missing, stale, cancelled, timed out, malformed, unavailable, or tied to another revision. `safe-change check` exit code `0` means no new regression; it does not convert an unresolved pre-existing failure into a verified state. Use `check --strict --json` for final approval; the strict gate also rejects protected oracle drift and observed input mutation. See [Verification integrity](verification-integrity.md).

## Profile Inventory

Profiles are included for Antigravity, Claude Code, Cursor, Codex, Cline, Kimi Code, Amp, OpenCode, Gemini CLI, and GitHub Copilot.

Amp and Antigravity share the project installation directory. Only one composed profile can occupy that path at a time. Manifest metadata identifies the active `agentProfile`; the top-level manifest owner remains the original installer for shared-directory compatibility. Switching profiles must be deliberate.

## Policy Change Requirements

A policy change must update tests and preserve these invariants:

1. Every supported adapter has exactly one profile.
2. Profiles cannot contain composition markers.
3. Profile identity must match the adapter ID.
4. Composition is deterministic.
5. The plugin copy remains identical to the canonical core.
6. Installed metadata hashes match installed bytes.
7. No policy file contains emoji, private filesystem paths, or secret material.