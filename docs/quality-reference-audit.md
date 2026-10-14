# Quality reference audit (unreleased)

All 13 requested repositories were shallow-cloned for read-only inspection. No upstream installer, reference agent instruction, model, Git hook or mutable remote instruction bundle was executed during the source audit. Subsequent pinned scanner/browser fixture execution is recorded separately in [preview validation](preview-validation.md). No source/assets/dependencies from these repositories are vendored in Safe-Change. The new implementation is original; repository ideas are references, not authority to overwrite project requirements. Safe-Change remains AGPL-3.0-only.

Machine-readable identities: [quality-reference-snapshots.json](quality-reference-snapshots.json). Each reference is pinned to the inspected commit, not a mutable main branch. This pins research only; scanner executables/databases and project policies must be pinned separately. Stars were not used as quality evidence.

| Reference | Inspected commit | License review | Application / boundary |
| --- | --- | --- | --- |
| [zansxart/anti-slop](https://github.com/zansxart/anti-slop/tree/f3511b93e21bbf84f9d1d347993afed49826d1f1) | `f3511b93e21b` | MIT | Separate truthful content, visual direction and delivery review. Original narrow heuristics, not the wholesale 39-rule corpus. |
| [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines/tree/434b7f91364665f2f733b310ec54809bf8f37937) | `434b7f913646` | MIT | Accessibility/keyboard/forms/motion review categories; no runtime remote-rule fetch or installer. |
| [aladicf/better-web-ui](https://github.com/aladicf/better-web-ui/tree/af21dcfa71d83104a9e0beb04ffedf79f800f53c) | `af21dcfa71d8` | custom-MIT-derived-restricted | Read-only comparison of design-process organization; no code, skill text or assets copied because of additional license restrictions. |
| [oss-review-toolkit/ort](https://github.com/oss-review-toolkit/ort/tree/dff18dba5f0732dfebf0057bdf824567e1f45957) | `dff18dba5f07` | Apache-2.0 | Setup profile for analyzer/scanner/evaluator/SBOM; policy pipeline still required. |
| [aboutcode-org/scancode-toolkit](https://github.com/aboutcode-org/scancode-toolkit/tree/022019a663e2b589cfda2aef37c22cda24d9bb83) | `022019a663e2` | Apache-2.0 software; CC-BY-4.0 data; third-party notices apply | Setup profile for file-level license/copyright review, including unknown results; no bundled detection database. |
| [sigstore/cosign](https://github.com/sigstore/cosign/tree/e2d25b54f768bdaa868318651e453b7bbc53c0ce) | `e2d25b54f768` | Apache-2.0 | Setup profile for exact signer/issuer/digest and predicate policy; no JSON pretending to verify signatures. |
| [ossf/scorecard](https://github.com/ossf/scorecard/tree/a1fe90aafa9169f150b2733fb608f6551077b371) | `a1fe90aafa91` | Apache-2.0 | Setup profile separates execution success from security-score policy. |
| [aquasecurity/trivy](https://github.com/aquasecurity/trivy/tree/08d7294725b45b6550d268d2a062556b2d725227) | `08d7294725b4` | Apache-2.0 | Inert fs check template with explicitly selected scanners/severities. |
| [semgrep/semgrep](https://github.com/semgrep/semgrep/tree/38a67a7eaf724fc266bf96e5705742bff8589775) | `38a67a7eaf72` | LGPL-2.1 engine; separate component/rule terms | Inert local-rule check template; no remote mutable rules or engine vendoring. |
| [gitleaks/gitleaks](https://github.com/gitleaks/gitleaks/tree/b58d3f102cf3a2c84cb7f923d05c25c9b1aed84b) | `b58d3f102cf3` | MIT | Inert redacted history check template; full-history coverage remains user responsibility. |
| [google/osv-scanner](https://github.com/google/osv-scanner/tree/f455353546889009663c1f8b640d5880a01c889a) | `f45535354688` | Apache-2.0 | Inert v2 source check template; DB/support availability remains explicit. |
| [github/codeql-action](https://github.com/github/codeql-action/tree/eb94de7c5cfc51dc10fff26d52210eb23a589b0e) | `eb94de7c5cfc` | MIT action; separate CodeQL terms | Preserve existing SHA-pinned workflow; SARIF assessment does not equate upload success with no findings. |
| [microsoft/playwright](https://github.com/microsoft/playwright/tree/647e485f2ba563ef055e2368fcc67bde67789cf0) | `647e485f2ba5` | Apache-2.0 | Inert local project runner template and strict native JSON assessment; live browser assertions remain project-specific. |

## Installer audit findings

- `zansxart/anti-slop` CLI can create agent-specific project/global skill directories, overwrite selected skill folders and update entry-file pointers. Its installer and install helper were read, not run. Those modifications are not needed for the original Safe-Change module.
- Vercel `install.sh` downloads `command.md` from remote `main`, writes user-global command/skill files and may append Windsurf rules. It was read, not run. Safe-Change never loads mutable remote instructions during a quality check.
- `better-web-ui` root LICENSE explicitly adds restrictions and says it is not standard MIT; README marks maintenance mode and a shift to better-react-web-ui. No restricted skill/source is copied or re-licensed.
- ScanCode NOTICE separates Apache-2.0 software and CC-BY-4.0 detection data; bundled third-party components have their own notices. Semgrep engine/component/rule terms and CodeQL action/product terms must not be flattened to a single repository badge.

## Evidence and limits

The audited source includes frontend rules/installer implementations, scanner CLI docs, Playwright JSON reporter types, ORT evaluator CLI behavior and license notices. This is a scoped interface/license inspection, not an exhaustive security audit of thirteen projects. New tests cover original heuristics, report parsing, bounded local files, named-check delivery policy and current-evidence drift. Scanner templates are not claims that all external tools are enabled in consumer repositories; later [preview validation](preview-validation.md) records the exact live-tested subset and platforms.

Do not copy implementation from a restricted reference without separate permission/license review. None of the scanners can prove every line was lawfully authored by a human, and this implementation makes no patentability claim.
