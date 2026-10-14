import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTempRepo, type TempRepo } from '../helpers/temp-repo.js';
import { runSave } from '../../src/commands/save.js';
import { runCheck } from '../../src/commands/check.js';
import { qualityGate, validateQualityPolicy } from '../../src/quality/gate.js';
import { runQuality } from '../../src/commands/quality.js';
let repo: TempRepo; let previous: string;
const policy = { version: 1 as const, requiredChecks: ['test'], maxAgeSeconds: 3600 };
beforeEach(async () => {
  repo=await createTempRepo(); previous=process.cwd(); process.chdir(repo.path);
  vi.spyOn(process.stdout,'write').mockImplementation(() => true);vi.spyOn(process.stderr,'write').mockImplementation(() => true);
  await repo.writeFile('.gitignore','.safe-change/\n');
  await repo.writeFile('src/app.ts','export const x = 1;');
  await repo.createConfig([{name:'test', executable:process.execPath,args:['-e','process.exit(0)']}]);
  await repo.git('add','.');await repo.git('commit','-m','fixture');
});
afterEach(async () => { process.chdir(previous);vi.restoreAllMocks();await repo.cleanup(); });
async function verify() { expect(await runSave({description:'before',format:'json'})).toBe(0);expect(await runCheck({format:'json',strict:true})).toBe(0); }
async function changeSummary(edit: (s:any)=>void) { const s=JSON.parse(await readFile(join(repo.path,'.safe-change/last-verification-summary.json'),'utf8'));edit(s);await repo.writeFile('.safe-change/last-verification-summary.json',JSON.stringify(s)); }
describe('current-evidence quality gate', () => {
 it('does not approve missing evidence', async () => { expect((await qualityGate(repo.path,policy)).status).toBe('NOT_VERIFIED'); });
 it('requires unique nonempty check names and bounded expiry', () => {
  expect(validateQualityPolicy(policy)).toEqual(policy);
  for (const bad of [null,[],{}, {...policy,requiredChecks:[]},{...policy,requiredChecks:['x','x']},{...policy,requiredChecks:['x\n']},{...policy,maxAgeSeconds:0},{...policy,maxAgeSeconds:86401},{...policy,maxAgeSeconds:1.5},{...policy,extra:true}]) expect(()=>validateQualityPolicy(bad)).toThrow();
 });
 it('passes only matching current strict evidence and fails after an edit', async () => {
  await verify();expect((await qualityGate(repo.path,policy)).status).toBe('PASS');
  await repo.writeFile('src/app.ts','export const x=2;');expect((await qualityGate(repo.path,policy)).status).toBe('NOT_VERIFIED');
 });
 it('rejects changed policy inputs, baseline, config, and missing required checks', async () => {
  await verify();expect((await qualityGate(repo.path,{...policy,requiredChecks:['security']})).status).toBe('NOT_VERIFIED');
  await repo.createConfig([{name:'other',executable:process.execPath,args:['-e','process.exit(0)']}]);
  expect((await qualityGate(repo.path,policy)).status).toBe('NOT_VERIFIED');
 });
 it.each(['expired','future','invalid'])('rejects %s timestamps', async mode => {
  await verify();await changeSummary(s=>{s.generatedAt=mode==='invalid'?'bad':new Date(Date.now()+(mode==='future'?60000:-7200000)).toISOString();});
  expect((await qualityGate(repo.path,policy)).status).toBe('NOT_VERIFIED');
 });
 it.each(['failed','not-verified','bad-exit','duplicate','missing','timeout','blocked','secret','null','malformed'])('does not bless %s evidence', async mode => {
  await verify();await changeSummary(s=>{
   if(mode==='failed'||mode==='not-verified')s.state=mode;
   if(mode==='bad-exit')s.exitCode=1;
   if(mode==='duplicate')s.checks.push(s.checks[0]);
   if(mode==='missing')s.checks=[];
   if(mode==='timeout')s.checks[0].timedOut=true;
   if(mode==='blocked')s.checks[0].outputBlocked=true;
   if(mode==='secret')s.checks[0].detectedSecretTypes=['generic-secret'];
   if(mode==='null')s.checks=[null];
   if(mode==='malformed')s.checks={};
  });expect((await qualityGate(repo.path,policy)).status).not.toBe('PASS');
 });
 it('rejects unreadable JSON and no baseline even if summary looks verified', async()=>{
   await repo.writeFile('.safe-change/last-verification-summary.json','{');expect((await qualityGate(repo.path,policy)).status).toBe('NOT_VERIFIED');
   await repo.writeFile('.safe-change/last-verification-summary.json',JSON.stringify({schemaVersion:1,state:'verified',checks:[],generatedAt:new Date().toISOString()}));expect((await qualityGate(repo.path,policy)).status).toBe('NOT_VERIFIED');
 });
});
describe('quality CLI dispatcher',()=>{
 it('prints profiles without running installers and scans source',async()=>{
  expect(await runQuality({values:['profile'],format:'json'})).toBe(0);
  expect(await runQuality({values:['profile','trivy'],format:'json'})).toBe(0);
  expect(await runQuality({values:['scan'],format:'json'})).toBe(0);
  await repo.writeFile('src/a.ts','try{}catch{}');expect(await runQuality({values:['scan'],format:'terminal'})).toBe(1);
 });
 it('imports bounded report files without calling scanners',async()=>{
  await repo.writeFile('.safe-change/report.json',JSON.stringify({version:'2.1.0',runs:[{tool:{driver:{name:'test'}},results:[],invocations:[{executionSuccessful:true}]}]}));
  expect(await runQuality({values:['report','sarif'],file:'.safe-change/report.json',format:'json'})).toBe(0);
  await repo.writeFile('.safe-change/report.json','{}');
  expect(await runQuality({values:['report','sarif'],file:'.safe-change/report.json',format:'json'})).toBe(1);
 });
 it('uses current evidence and a literal policy file',async()=>{
  await repo.writeFile('quality-policy.json',JSON.stringify(policy));await verify();
  expect(await runQuality({values:['gate'],file:'quality-policy.json',format:'json'})).toBe(0);
  await repo.writeFile('src/app.ts','export const x=3;');expect(await runQuality({values:['gate'],file:'quality-policy.json',format:'json'})).toBe(1);
 });
 it('rejects unknown actions, extra arguments, unsafe files, malformed policies and unused flags',async()=>{
  for(const values of [[],['report'],['report','unknown'],['bad'],['scan','extra'],['profile','x','extra'],['profile','unknown'],['gate']])expect(await runQuality({values,format:'json'})).toBe(3);
  for(const values of [['profile'],['scan']])expect(await runQuality({values,file:'x',format:'json'})).toBe(3);
  expect(await runQuality({values:['gate'],file:'../x',format:'json'})).toBe(3);
 });
});
