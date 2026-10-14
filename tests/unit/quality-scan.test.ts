import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTempRepo, type TempRepo } from '../helpers/temp-repo.js';
import { inspectQualitySource, scanQuality } from '../../src/quality/scan.js';
import { readQualityFile } from '../../src/quality/files.js';
import { qualityProfile, QUALITY_PROFILES } from '../../src/quality/profiles.js';
let repo: TempRepo;
beforeEach(async () => { repo = await createTempRepo(); });
afterEach(async () => repo.cleanup());
describe('original limited anti-slop audit', () => {
  it('finds swallowed failures and focused tests without inspecting string literals as code', () => {
    const findings = inspectQualitySource('src/app.ts', 'try { run(); } catch {}\ntest.only("x", () => {});\nit.concurrent.only("y", () => {});\nconst s = "test.only";');
    expect(findings.map(f => f.rule)).toEqual(['CODE-EMPTY-CATCH', 'CODE-FOCUSED-TEST', 'CODE-FOCUSED-TEST']);
    expect(findings[1]?.line).toBe(2);
  });
  it('does not reject intentional function bodies or handled errors', () => {
    expect(inspectQualitySource('src/app.ts', 'function noop() {}\ntry {} catch (err) { throw err; }\nconst s = "@ts-nocheck";')).toEqual([]);
  });
  it('flags file-wide type suppression only in comments', () => {
    expect(inspectQualitySource('src/a.ts', '// @ts-nocheck\nconst x = 1;').map(f => f.rule)).toEqual(['CODE-DISABLED-TYPECHECK']);
    expect(inspectQualitySource('src/a.js', '/* @ts-nocheck */\nconst x = 1;')).toHaveLength(1);
  });
  it('reports syntax errors rather than trusting a partial parse', () => {
    expect(inspectQualitySource('src/bad.ts', 'export const = {;').some(f => f.rule === 'CODE-PARSE')).toBe(true);
  });
  it('finds JSX alt and semantic action review needs', () => {
    const f = inspectQualitySource('src/a.tsx', 'const a = <><img src="x"/><img {...props}/><div onClick={go}/><span onClick={go}/></>;');
    expect(f.map(x => x.rule)).toEqual(['UI-IMAGE-ALT','UI-IMAGE-ALT','UX-SEMANTIC-ACTION','UX-SEMANTIC-ACTION']);
    expect(f[1]?.message).toContain('unknown');
    expect(inspectQualitySource('ok.tsx','const a = <><img alt=""/><button onClick={go}/></>;')).toEqual([]);
  });
  it('flags zoom and broad transitions, not comments or visual taste', () => {
    const f = inspectQualitySource('a.html', '<!-- maximum-scale=1 -->\n<meta content="user-scalable=no, maximum-scale=1">\n<style>/* transition: all */ .a {transition: all 1s}</style>');
    expect(f).toHaveLength(3);
    expect(inspectQualitySource('a.css', '.a {background: linear-gradient(red,blue);transition: opacity .2s}')).toEqual([]);
    expect(inspectQualitySource('README.md','transition: all')).toEqual([]);
  });
  it('returns NOT_VERIFIED for no supported sources', async () => {
    expect((await scanQuality(repo.path)).status).toBe('NOT_VERIFIED');
  });
  it('scans Git-visible tracked and untracked sources but not ignored or generated files', async () => {
    await repo.writeFile('src/clean.ts', 'export const value = 1;');
    await repo.writeFile('.gitignore', 'ignored/\n.safe-change/\n');
    await repo.writeFile('ignored/bad.ts', 'try{}catch{}');
    await repo.writeFile('dist/bad.js', 'try{}catch{}');
    await repo.writeFile('src/types.d.ts','export declare const x: string;');
    let report = await scanQuality(repo.path);
    expect(report.status).toBe('CLEAN_LIMITED'); expect(report.inspectedFiles).toBe(1);
    await repo.writeFile('src/bad.ts','try{}catch{}');
    report = await scanQuality(repo.path);
    expect(report.status).toBe('REVIEW'); expect(report.findings[0]?.path).toBe('src/bad.ts');
    expect(report.limitations.join(' ')).toContain('human-authorship');
  });
  it('refuses oversized source rather than silently passing', async () => {
    await repo.writeFile('big.ts',' '.repeat(1024*1024+1));
    await expect(scanQuality(repo.path)).rejects.toThrow('bounded');
  });
  it('bounds per-file finding volume rather than silently truncating', () => {
    expect(() => inspectQualitySource('a.ts','try{}catch{}\n'.repeat(1001))).toThrow('budget');
  });
  it('does not include source snippets or secret literals in findings', () => {
    const value='do-not-echo-this-content';
    expect(JSON.stringify(inspectQualitySource('x.ts', `try { use("${value}"); } catch {}`))).not.toContain(value);
  });
});
describe('bounded quality inputs', () => {
  it.each(['../escape','/etc/passwd','a/../b','a\\b','./a','a//b','a\n.ts',''])('rejects unsafe path %s', async name => {
    await expect(readQualityFile(repo.path,name)).rejects.toThrow();
  });
  it('reads regular files but not directories', async () => {
    await repo.writeFile('nested/a.json','{}');
    expect(await readQualityFile(repo.path,'nested/a.json')).toBe('{}');
    await expect(readQualityFile(repo.path,'nested')).rejects.toThrow();
  });
  it('rejects file and parent symlinks', async () => {
    await repo.writeFile('actual/a.json','{}');
    await symlink(join(repo.path,'actual'),join(repo.path,'linked'),process.platform === 'win32' ? 'junction' : 'dir');
    await expect(readQualityFile(repo.path,'linked/a.json')).rejects.toThrow('symbolic');
    if (process.platform !== 'win32') {
      await symlink(join(repo.path,'actual/a.json'),join(repo.path,'link.json'));
      await expect(readQualityFile(repo.path,'link.json')).rejects.toThrow('symbolic');
    }
  });
});
describe('inert scanner integration profiles', () => {
  it('provides unique profiles and defensive copies without installing anything', () => {
    expect(new Set(QUALITY_PROFILES.map(p => p.id)).size).toBe(11);
    for (const p of QUALITY_PROFILES) expect(qualityProfile(p.id).prerequisites.length).toBeGreaterThan(0);
    const p=qualityProfile('trivy'); p.check!.args.push('BAD');
    expect(qualityProfile('trivy').check!.args).not.toContain('BAD');
    expect(() => qualityProfile('bad')).toThrow();
  });
  it('never offers generation or upload success as a compliance gate', () => {
    for (const id of ['ort','scancode','cosign','scorecard','codeql']) {
      const p=qualityProfile(id);expect(p.mode).toBe('setup-required');expect(p.check).toBeUndefined();
    }
    expect(qualityProfile('gitleaks').check!.args).toContain('--redact');
    expect(qualityProfile('playwright').check!.executable).toBe('node');
    expect(qualityProfile('semgrep').check!.args).toContain('--strict');
  });
});
