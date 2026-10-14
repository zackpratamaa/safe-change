import ts from 'typescript';
import { getFileEntries, getRepositoryRoot } from '../git/inspector.js';
import { readQualityFile } from './files.js';

export interface QualityFinding { rule: string; path: string; line: number; message: string }
export interface QualityScan {
  schemaVersion: 1; status: 'CLEAN_LIMITED' | 'REVIEW' | 'NOT_VERIFIED';
  inspectedFiles: number; excludedFiles: number; findings: QualityFinding[];
  limitations: string[];
}

/** Original, deliberately narrow heuristics. No AI-authorship or aesthetic classifier. */
export function inspectQualitySource(path: string, text: string): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
  const add = (rule: string, offset: number, message: string): void => {
    if (findings.length >= 1000) throw new Error('Quality findings exceed per-file budget');
    let low = 0, high = lineStarts.length;
    while (low + 1 < high) { const middle = Math.floor((low + high) / 2); if (lineStarts[middle]! <= offset) low = middle; else high = middle; }
    findings.push({ rule, path, line: low + 1, message });
  };
  if (/\.[cm]?[jt]sx?$/.test(path)) {
    const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const diagnostics = (file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
    if (diagnostics.length) add('CODE-PARSE', diagnostics[0]?.start ?? 0, 'Source cannot be parsed; review syntax before trusting this audit.');
    const visit = (node: ts.Node): void => {
      if (ts.isCatchClause(node) && node.block.statements.length === 0) add('CODE-EMPTY-CATCH', node.getStart(file), 'Empty catch can conceal failure; handle it or explain and review the intentional suppression.');
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const call = node.expression;
        if (call.name.text === 'only' && /^(?:test|it|describe)(?:\.[A-Za-z]+)*$/.test(call.expression.getText(file))) add('CODE-FOCUSED-TEST', node.getStart(file), 'Focused test can silently exclude the rest of the suite.');
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(file);
        const attrs = node.attributes.properties;
        const has = (name: string): boolean => attrs.some(a => ts.isJsxAttribute(a) && a.name.getText(file) === name);
        const spread = attrs.some(a => ts.isJsxSpreadAttribute(a));
        if (tag === 'img' && !has('alt')) add('UI-IMAGE-ALT', node.getStart(file), spread ? 'Image alternative text is unknown behind a spread; inspect the rendered accessible name.' : 'Image needs an explicit alternative text decision, including empty alt for decorative content.');
        if ((tag === 'div' || tag === 'span') && has('onClick')) add('UX-SEMANTIC-ACTION', node.getStart(file), 'Review clickable non-semantic element; prefer native actions and verify keyboard/focus behavior.');
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, text);
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
      if ((token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) && /@ts-nocheck\b/.test(scanner.getTokenText())) add('CODE-DISABLED-TYPECHECK', scanner.getTokenPos(), 'File-wide type-check suppression needs explicit review; do not disable verification to obtain a pass.');
    }
  }
  if (/\.(?:css|scss|html)$/.test(path)) {
    const clean = text.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
    const rules: [string, RegExp, string][] = [
      ['UI-TRANSITION-ALL', /\btransition\s*:\s*all\b/gi, 'Review broad transitions; name intended properties and verify reduced-motion behavior.'],
      ['UX-ZOOM-DISABLED', /(?:user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0)?(?:\s|[,"'>]|$))/gi, 'Viewport may disable user zoom; preserve accessible magnification.'],
    ];
    for (const [rule, pattern, message] of rules) for (const match of clean.matchAll(pattern)) add(rule, match.index, message);
  }
  return findings;
}

export async function scanQuality(root: string): Promise<QualityScan> {
  root = await getRepositoryRoot(root);
  const names = Object.keys(await getFileEntries(root)).sort();
  const selected = names.filter(n => /\.(?:[cm]?[jt]sx?|css|scss|html)$/.test(n) && !/(^|\/)(?:node_modules|dist|coverage|vendor|target)\//.test(n) && !/\.d\.ts$/.test(n));
  if (selected.length > 10000) throw new Error('Quality scan exceeds 10000 candidate files; split the project before scanning');
  const findings: QualityFinding[] = [];
  let totalBytes = 0;
  for (const name of selected) {
    const text = await readQualityFile(root, name);
    totalBytes += Buffer.byteLength(text);
    if (totalBytes > 32 * 1024 * 1024) throw new Error('Quality scan exceeds 32 MiB aggregate source budget');
    findings.push(...inspectQualitySource(name, text));
    if (findings.length > 20000) throw new Error('Quality scan exceeds aggregate findings budget');
  }
  return { schemaVersion: 1, status: !selected.length ? 'NOT_VERIFIED' : findings.length ? 'REVIEW' : 'CLEAN_LIMITED', inspectedFiles: selected.length, excludedFiles: names.length - selected.length, findings,
    limitations: ['Only Git-visible supported source files, at most 1 MiB each, are inspected.', 'No browser, runtime accessibility, visual taste, plagiarism, human-authorship, security-completeness or license-compliance proof.', 'Findings need review; no automatic code changes or universal bans on visual techniques.'] };
}
