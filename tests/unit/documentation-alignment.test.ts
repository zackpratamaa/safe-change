import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(__dirname, "../..");
function markdown(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? markdown(path) : entry.name.endsWith(".md") ? [path] : [];
  });
}
const files = [
  ...readdirSync(root).filter(name => name.endsWith(".md")).map(name => join(root, name)),
  ...["docs", "skills", "plugins"].flatMap(name => markdown(join(root, name))),
];

describe("Documentation source-contract alignment", () => {
  it("uses implemented CLI commands in executable examples", () => {
    const cli = readFileSync(join(root, "src/cli.ts"), "utf8");
    const commands = new Set([...cli.matchAll(/case "([\w-]+)"/g)].map(match => match[1]));
    const unknown: string[] = [];
    for (const file of files) {
      let executableFence = false;
      let fenced = false;
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const fence = /^(`{3,})(.*)$/.exec(line);
        if (fence) {
          if (fenced) { fenced = false; executableFence = false; }
          else {
            fenced = true;
            executableFence = ["", "bash", "sh", "shell", "console"].includes(fence[2]!.trim());
          }
          continue;
        }
        if (!executableFence) continue;
        const match = /^\s*(?:\$ )?safe-change\s+([a-z][\w-]*)/.exec(line);
        if (match && !commands.has(match[1])) unknown.push(`${file}: ${match[1]}`);
      }
    }
    expect(unknown).toEqual([]);
  });
  it("has resolvable local Markdown links and no machine-specific file URIs", () => {
    const errors: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      if (content.includes("file:///")) errors.push(`${file}: machine-specific URI`);
      for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const url = match[1]!;
        if (/^(?:https?:|mailto:|#)/.test(url) || /[<{]/.test(url)) continue;
        const path = url.split("#")[0]!;
        if (path && !existsSync(resolve(file, "..", path))) errors.push(`${file}: ${url}`);
      }
    }
    expect(errors).toEqual([]);
  });
  it("uses strict verification in active final-gate guides", () => {
    for (const name of ["GUIDE.md", "docs/integrity-core.md", "docs/operations-runbook.md", "docs/enterprise-enforcement.md"]) {
      const content = readFileSync(join(root, name), "utf8");
      expect(content).toContain("safe-change check --strict");
      expect(content).not.toMatch(/^\s*safe-change check(?: --json)?\s*$/m);
    }
  });
  it("keeps JSON configuration examples parseable", () => {
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(/^```json\s*\n(.*?)^```\s*$/gms)) {
        expect(() => JSON.parse(match[1]!)).not.toThrow();
      }
    }
  });
  it("documents actual replay categories and reserved detector boundaries", () => {
    const types = readFileSync(join(root, "src/replay/types.ts"), "utf8").split("export interface")[0]!;
    const doc = readFileSync(join(root, "docs/verifiable-execution.md"), "utf8");
    for (const match of types.matchAll(/"([A-Z_]+)"/g)) expect(doc).toContain(match[1]);
    expect(doc).toContain("no independent");
    expect(doc).toContain("--reexecute");
    expect(doc).not.toContain("safe-change verify --record-replay");
  });
  it("preserves canonical skill parity and explicit strict/save failure contracts", () => {
    const core = readFileSync(join(root, "skills/safe-change/SKILL.md"), "utf8");
    expect(readFileSync(join(root, "plugins/antigravity/skills/safe-change/SKILL.md"), "utf8")).toBe(core);
    expect(core).toContain("Exit `1`: inputs changed during baseline checks");
    expect(core).toContain("--strict");
    expect(core).not.toContain("Exit `2`: state write failure");
  });
});