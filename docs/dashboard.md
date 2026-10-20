# Local dashboard and local status API — Experimental preview

The safe-change local dashboard provides a clean, visual interface for monitoring baseline state, inspecting verification history, assessing enterprise risk, and tracking cryptographic trust during AI agent sessions.

## Overview

The dashboard uses an embedded Node.js HTTP server. The package has runtime dependencies declared in the root manifest; this is not a zero-dependency package claim. The local status handlers are not a telemetry upload service. The interface uses a liquid-glass design system built on Apple San Francisco typography, structured layout grids, interactive inspection drawers, and dedicated tabs for local verification status.

The dashboard displays the brand mark **`/SAFE-CHANGE`** and is designed to provide full transparency into AI-driven code modifications.

## Running the Dashboard

To launch the dashboard server in your project repository:

```bash
safe-change dashboard
```

Upon startup, the command initializes the server and outputs the local access URL:

```
Dashboard running at http://localhost:4242
Press Ctrl+C to stop.
```

To run in headless or daemon mode without automatically attempting to launch a browser window, use `--no-open`:

```bash
safe-change dashboard --no-open
```

Open `http://127.0.0.1:4242` in any modern web browser to access the interface.

---

## 6 Hero Metric Cards (Liquid Glass Grid)

The top header metric grid aggregates real-time repository health into six responsive operational indicators:

1. **System State**: Real-time verification sentinel displaying `Nominal` (green), `Regression` (red), or `No Baseline` (orange).
2. **Monitored Baseline**: Number of tracked codebase files and confirmation of the active baseline snapshot.
3. **Enterprise Risk & Mode**: Dynamic risk score (`0–100`) and the active operating mode (`STANDARD`, `ENHANCED`, `HIGH_ASSURANCE`, or `CRITICAL_CHANGE`).
4. **Change Budget**: Evaluates whether working-tree additions, deletions, and file modifications remain within configured enterprise bounds.
5. **Active Write Lease**: Displays write lease lock state (`Unlocked` vs `Locked by Holder`), indicating cooperative coordination, not blocking arbitrary filesystem writes by another agent.
6. **Audit & Trust**: Real-time verification of the tamper-evident SHA-256 audit hash chain and total recorded events count.

---

## Interactive Navigation Tabs

The dashboard uses an Apple macOS-styled segmented navigation bar to organize features into six dedicated views:

### 1. Overview & Baseline (Default View)
The primary operational cockpit, preserving the four core monitoring panels:
- **Panel 1 — Current Status**: Active baseline metadata (timestamp, description, git commit, monitored files, and passing checks rate).
- **Panel 4 — Active Rules**: Configured guardrails from `.safe-change/rules.json` (e.g., `no-delete-migrations`, `no-modify-lockfile`, `max-deleted-files`) with severity badges.
- **Panel 3 — Regression Timeline**: Horizontal chronological stream of verification runs with color-coded nodes, diff pills (`+` added, `~` modified, `-` deleted), and an interactive inspector drawer.
- **Panel 2 — Log History**: Comprehensive audit table with execution IDs, triggers (`CLI` vs `MCP`), check summaries, and quick filters (`All`, `Clean`, `Regressions`).

### 2. Enterprise Risk & Budget
- **Risk Assessment Score Gauge**: Circular visual gauge displaying the calculated risk score (0–100) and required policy mode.
- **Risk Signals Classifier**: Real-time categorization of modified files (source code, tests, CI workflows, authentication, migrations, and potential policy downgrades).
- **Change Budget Guardrails**: Side-by-side comparison of actual metrics versus allowed limits (max files changed, max additions/deletions, public API mutations, and lockfile change restrictions).

### 3. AST Semantic Security
- **Syntax Tree Diff Engine**: Heuristic inspection using the TypeScript compiler API and JSON adapter; no SWC parser is used.
- **Breaking API Export Detection**: Identifies removed or renamed export symbols, modified function signatures, and structural AST regressions.
- **Fail-Closed Boundaries**: Displays semantic report findings; the dashboard does not itself intercept writes or automatically run semantic-diff before checks.

### 4. Verifiable Replay & Attestations
- **Signed Attestation Envelopes**: Displays in-toto RFC 8785 Ed25519-signed attestation envelopes generated in `.safe-change/attestations/`.
- **Deterministic Replay Bundles**: Displays replay manifests stored in `.safe-change/replay/`; metadata verification and requested reexecution are distinct. The UI does not itself prove a fresh rerun.

### 5. Identity & Trust Registry
- **Authorized Approvers**: Lists local enrolled identities and PEM public keys with registry roles (security-lead, release-manager, lead-maintainer, developer); capability policy is a separate configuration.
- **Multi-Signer Quorum**: Displays multi-party approval requirements for critical enterprise operations.

### 6. Tamper-Evident Audit Chain
- **Cryptographic Verification Banner**: Confirms SHA-256 hash chaining integrity (`CHAIN INTEGRITY VERIFIED (PASS)`).
- **Tamper-Evident Local Audit Stream**: Displays recorded events and hash links. This is a local digest chain, not immutable external storage; a local state writer can rebuild it.

---

## Local status API endpoints

The dashboard exposes read-only local JSON status endpoints for inspection by local clients:

| Endpoint | HTTP Method | Description |
|---|:---:|---|
| `/` | `GET` | Serves the self-contained Apple Liquid Glass HTML interface |
| `/api/status` | `GET` | Baseline metadata, tracked files count, and checks status |
| `/api/log` | `GET` | Historical array of recorded safe-change verification entries |
| `/api/config` | `GET` | Project `.safe-change.json` configuration |
| `/api/rules` | `GET` | Active safety rules registry and validation status |
| `/api/enterprise` | `GET` | Real-time risk evaluation, score (0-100), operating mode, and budget diff |
| `/api/lease` | `GET` | Current write lease lock status, holder, and expiration |
| `/api/audit` | `GET` | Tamper-evident SHA-256 audit events with cryptographic chain verification |
| `/api/identity` | `GET` | Authorized approver identities and Ed25519 public keys |
| `/api/verifiable` | `GET` | Latest AST semantic diff report, signed attestations, and replay sessions |

---

## Port Configuration

By default, the dashboard binds to port `4242`. If port `4242` is occupied or if you are running multiple projects simultaneously, specify a custom port with `--port` or `-p`:

```bash
safe-change dashboard --port 5000
safe-change dashboard -p 8080
```

You can also specify a permanent port in `.safe-change.json`:

```json
{
  "dashboardPort": 8080
}
```

If the specified port cannot be bound, the CLI reports an error and exits cleanly without hanging.

---

## Security and Privacy

Experimental preview boundaries; these controls do not establish high-assurance certification or independent review:

- **Localhost-Only Binding**: The HTTP server strictly binds to `127.0.0.1`. It never listens on `0.0.0.0` or external network interfaces, but does not authenticate other local processes or prevent an operator from exposing the port through a proxy or forwarding rule. See [the binding implementation](../src/dashboard/server.ts) and the `binds only to 127.0.0.1` [runtime test](../tests/unit/dashboard-server.test.ts).
- **Air-Gapped Operation**: The dashboard assets, CSS styles, and typography are rendered locally without third-party CDN dependencies, tracking scripts, or external network requests.
- **Read-Only Access**: The dashboard interface provides read-only inspection of `.safe-change/` artifacts. It cannot mutate repository state, alter Git history, or modify source code files.
- **Method Restriction**: Rejects any non-`GET` HTTP request immediately with `405 Method Not Allowed`.
- **Path Traversal Defense**: The server implements a strict allowlist of fixed endpoints; arbitrary filesystem paths cannot be requested or served.
