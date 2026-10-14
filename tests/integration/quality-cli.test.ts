import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempRepo, type TempRepo } from '../helpers/temp-repo.js';
const exec = promisify(execFile);
const cli=resolve('dist/cli.js');
let repo:TempRepo;
beforeEach(async()=>{repo=await createTempRepo();});afterEach(async()=>repo.cleanup());
async function run(...args:string[]) {
 try { const r=await exec(process.execPath,[cli,...args],{cwd:repo.path,timeout:90000,maxBuffer:1024*1024});return {code:0,...r}; }
 catch(e:any){if(typeof e.code!=='number')throw e;return {code:e.code,stdout:e.stdout as string,stderr:e.stderr as string};}
}
describe('packaged quality CLI wiring',()=>{
 it('exposes help and inert profiles without a project config',async()=>{
  expect((await run('--help')).stdout).toContain('quality <action>');
  const r=await run('quality','profile','trivy','--json');expect(r.code).toBe(0);expect(JSON.parse(r.stdout).check.executable).toBe('trivy');
  const p=await run('quality','profile','cosign','--json');expect(JSON.parse(p.stdout).check).toBeUndefined();
 });
 it('reports no sources as unverified and findings as review, not silent pass',async()=>{
  expect((await run('quality','scan','--json')).code).toBe(1);
  await repo.writeFile('a.ts','export const x=1;');expect((await run('quality','scan','--json')).code).toBe(0);
  await repo.writeFile('a.ts','try{}catch{}');const r=await run('quality','scan','--json');expect(r.code).toBe(1);expect(JSON.parse(r.stdout).status).toBe('REVIEW');
 });
 it('assesses native reports but makes no current verification claim',async()=>{
  await repo.writeFile('report.json',JSON.stringify({version:'2.1.0',runs:[{tool:{driver:{name:'test'}},results:[],invocations:[{executionSuccessful:true}]}]}));
  const r=await run('quality','report','sarif','--file','report.json','--json');expect(r.code).toBe(0);expect(JSON.parse(r.stdout).status).toBe('PASS_REPORTED');
  expect((await run('quality','report','sarif','--file','../report.json')).code).toBe(3);
 });
 it('fails closed on missing evidence and malformed JSON',async()=>{
  await repo.writeFile('quality-policy.json',JSON.stringify({version:1,requiredChecks:['test'],maxAgeSeconds:3600}));
  const r=await run('quality','gate','--file','quality-policy.json','--json');expect(r.code).toBe(1);expect(JSON.parse(r.stdout).status).toBe('NOT_VERIFIED');
  await repo.writeFile('quality-policy.json','{');expect((await run('quality','gate','--file','quality-policy.json')).code).toBe(3);
 });
});
