# Safety Rules Registry

Safety rules establish explicit boundaries and invariants that AI coding agents must not violate when modifying your codebase. When agents refactor code, generate migrations, or update configurations, safety rules enforce structural constraints before changes can be accepted.

## Overview

While `safe-change check` compares baseline test outputs to identify regressions in code behavior, safety rules evaluate file system operations and change volumes directly. Rules can prohibit the deletion of critical directories, flag modifications to lockfiles, place limits on bulk file edits, or require specific check commands to pass.

Rules are stored in `.safe-change/rules.json` and are evaluated automatically on every `safe-change check` invocation, including strict mode. Rules alone do not turn a zero-check run into verified status; use `check --strict --json` for final approval and inspect the result.

## CLI Usage

Manage rules using the `safe-change rules` command suite:

### Listing Rules

View active project rules alongside all available built-in templates:

```bash
safe-change rules list
```

To output rules in machine-readable JSON:

```bash
safe-change rules list --json
```

### Adding a Rule

Activate a built-in rule by its canonical identifier:

```bash
safe-change rules add no-delete-migrations
safe-change rules add max-files-changed
```

If the rule is already active, safe-change confirms its active status without creating duplicate entries.

### Removing a Rule

Deactivate and remove an active rule from the project:

```bash
safe-change rules remove no-delete-migrations
```

### Validating Configuration

Validate the schema and structural integrity of `.safe-change/rules.json`:

```bash
safe-change rules validate
```

Validation ensures all registered rules contain required identifiers, non-empty names, valid severity levels (`error` or `warn`), and supported condition definitions.

## Built-in Rules

safe-change includes 6 production-grade built-in rules designed for standard software repositories:

| Identifier | Name | Severity | Condition Type | Target / Threshold |
| :--- | :--- | :--- | :--- | :--- |
| `no-delete-migrations` | No Delete Migrations | `error` | `file-not-deleted` | `**/migrations/**` |
| `no-delete-env` | No Delete Environment Files | `error` | `file-not-deleted` | `**/.env*` |
| `no-modify-lockfile` | No Modify Lockfiles | `warn` | `file-not-modified` | `**/package-lock.json`, `**/yarn.lock`, etc. |
| `max-files-changed` | Max Files Changed | `warn` | `max-files-changed` | `threshold: 50` |
| `max-deleted-files` | Max Deleted Files | `error` | `max-deleted-files` | `threshold: 10` |
| `require-tests-pass` | Require Tests Pass | `error` | `require-check-pass` | `checkName: "test"` |

### Built-in Rule Details and Use Cases

#### 1. `no-delete-migrations`
- **Severity**: `error`
- **Purpose**: Prevents accidental deletion of SQL schema migrations or ORM migration files (e.g., Prisma, Knex, Flyway, Alembic, Django).
- **Use Case**: Agents attempting to consolidate or reset schemas may delete migration histories, causing irrecoverable drift in production databases.

#### 2. `no-delete-env`
- **Severity**: `error`
- **Purpose**: Prevents deletion of `.env`, `.env.local`, `.env.production`, or other secret configuration files.
- **Use Case**: Agents cleaning up directories or refactoring configuration loaders must never discard local environment credentials.

#### 3. `no-modify-lockfile`
- **Severity**: `warn`
- **Purpose**: Detects direct alterations to package lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, `poetry.lock`, `composer.lock`).
- **Use Case**: Lockfiles should be modified exclusively through package managers (`npm install`, `cargo update`), never hand-edited by language models.

#### 4. `max-files-changed`
- **Severity**: `warn`
- **Purpose**: Flags any iteration where the cumulative number of modified and added files exceeds 50.
- **Use Case**: Warns developers when an agent's change radius exceeds normal task boundaries, preventing accidental massive repository overhauls.

#### 5. `max-deleted-files`
- **Severity**: `error`
- **Purpose**: Blocks execution if an agent deletes more than 10 files in a single pass.
- **Use Case**: Guards against aggressive directory pruning, recursive directory deletions, or misplaced wildcards.

#### 6. `require-tests-pass`
- **Purpose**: Enforces that any check named `"test"` in your `.safe-change.json` configuration must exit with status `0` (`pass`).
- **Use Case**: Ensures the primary automated test suite is strictly green before accepting an agent pull request or commit.

## Authoring Custom Rules

You can add custom rules manually to `.safe-change/rules.json`. The configuration file must follow schema version 1:

```json
{
  "version": 1,
  "rules": [
    {
      "id": "protect-auth-routes",
      "name": "Protect Auth Routes",
      "description": "Prevent direct changes to core security middleware without review",
      "severity": "warn",
      "condition": {
        "type": "file-not-modified",
        "pattern": "src/middleware/auth/**"
      }
    },
    {
      "id": "limit-api-deletions",
      "name": "Limit API Deletions",
      "description": "Never delete public API endpoints",
      "severity": "error",
      "condition": {
        "type": "file-not-deleted",
        "patterns": [
          "src/api/v1/**",
          "src/controllers/**"
        ]
      }
    }
  ]
}
```

### Supported Condition Types

- `file-not-deleted`: Matches deleted files against `pattern` or `patterns` using platform-aware glob syntax.
- `file-not-modified`: Matches modified files against `pattern` or `patterns`.
- `max-files-changed`: Checks whether total modified + added files exceed `threshold`.
- `max-deleted-files`: Checks whether total deleted files exceed `threshold`.
- `require-check-pass`: Checks whether the check named `checkName` produced a passing result.

Glob matching supports recursive subdirectories (`**/`), single directory wildcards (`*`), and single character wildcards (`?`). On Windows, matching is case-insensitive; on Unix, matching is case-sensitive.

## Integration with `safe-change check`

When you or an agent execute `safe-change check`:

1. Baseline check comparison runs against current test execution results.
2. Active rules from `.safe-change/rules.json` are evaluated against file changes and check outcomes.
3. Violations are formatted in terminal and JSON outputs:
   - Violations with `error` severity output `[ERROR]` tags and set the command exit code to `1` (`ExitCodes.NEW_FAILURE`), signaling a regression to the agent.
   - Violations with `warn` severity output `[WARN]` tags as non-blocking advisory notices.
4. Any error violation automatically flags `regressionDetected: true` in `.safe-change/log.json`.
