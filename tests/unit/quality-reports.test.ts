import { describe, it, expect } from 'vitest';
import { evaluateQualityReport } from '../../src/quality/reports.js';
const sarif = () => ({version:'2.1.0',runs:[{tool:{driver:{name:'CodeQL'}},results:[] as unknown[],invocations:[{executionSuccessful:true}]}]});
const browser = () => ({errors:[], stats:{expected:1,unexpected:0,skipped:0,flaky:0},suites:[{specs:[{ok:true,tests:[{status:'expected',expectedStatus:'passed',results:[{status:'passed'}]}]}]}]});
describe('strict report-only import',()=>{
 it('distinguishes report PASS from authenticated current execution',()=>{
  const r=evaluateQualityReport('sarif',sarif());expect(r.status).toBe('PASS_REPORTED');expect(r.limitations.join(' ')).toContain('no signature');
 });
 it.each([null,[],{}, {version:'2.1.0',runs:[]}])('rejects missing SARIF metadata %#', data=>expect(evaluateQualityReport('sarif',data).status).toBe('NOT_VERIFIED'));
 it('rejects incomplete/failed invocations and even suppressed findings',()=>{
  for(const changes of [{tool:{}},{results:undefined},{invocations:[]},{invocations:[{executionSuccessful:false}]},{invocations:[{executionSuccessful:true,toolExecutionNotifications:[{level:'warning'}]}]},{invocations:[{executionSuccessful:true,toolConfigurationNotifications:{}}]}]){
   const data=sarif();Object.assign(data.runs[0]!,changes);expect(evaluateQualityReport('sarif',data).status).toBe('NOT_VERIFIED');
  }
  const data=sarif();data.runs[0]!.results=[{suppressions:[{status:'accepted'}]}];expect(evaluateQualityReport('sarif',data).status).toBe('FAIL');
 });
 it('aggregates multiple completed runs and permits note-only notifications',()=>{
  const data=sarif();data.runs.push({...data.runs[0]!,invocations:[{executionSuccessful:true,toolExecutionNotifications:[{level:'note'}]}] as any});expect(evaluateQualityReport('sarif',data).status).toBe('PASS_REPORTED');
 });
 it('accepts positive consistent browser results, including nested suites',()=>{
  const r=browser();expect(evaluateQualityReport('playwright',r).status).toBe('PASS_REPORTED');
  expect(evaluateQualityReport('playwright',{...r,suites:[{specs:[],suites:r.suites}]}).inspected).toBe(1);
 });
 it('rejects zero tests, inconsistent stats, failed/skipped/flaky results and fake counters',()=>{
  for(const data of [{...browser(),stats:{expected:0,unexpected:0,skipped:0,flaky:0},suites:[]},{...browser(),stats:{expected:2,unexpected:0,skipped:0,flaky:0}},{...browser(),stats:{expected:1,unexpected:0,skipped:1,flaky:0}},{...browser(),errors:[{message:'x'}]},{...browser(),suites:[{specs:[{ok:true,tests:[]}]}]},{...browser(),suites:[{specs:[{ok:true,tests:[{status:'expected',expectedStatus:'failed',results:[{status:'failed'}]}]}]}]},{...browser(),suites:[{specs:[]}],stats:{expected:'1'}},{...browser(),suites:[{}]},{}]) expect(evaluateQualityReport('playwright',data).status).not.toBe('PASS_REPORTED');
 });
 it('bounds traversal and treats unknown formats as unverified',()=>{
  const cyclic:any={specs:[]};cyclic.suites=[cyclic];expect(evaluateQualityReport('playwright',{...browser(),suites:[cyclic]}).status).toBe('NOT_VERIFIED');
  expect(evaluateQualityReport('cosign',{}).status).toBe('NOT_VERIFIED');
 });
});
