import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RollbackSession, executeWithRollback } from '../../src/installer/core/rollback.js';
let dir:string;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'sc-review-'));});
afterEach(()=>{vi.restoreAllMocks();rmSync(dir,{recursive:true,force:true});});
describe('review: recovery backup preservation',()=>{
 it('retains backup and both failure causes when automatic restoration fails',()=>{
  const target=join(dir,'target');mkdirSync(target);writeFileSync(join(target,'old.txt'),'original');let backup='';let caught:any;
  try{executeWithRollback(target,session=>{backup=session.backupDir;vi.spyOn(session,'restore').mockImplementation(()=>{throw new Error('restore denied');});writeFileSync(join(target,'old.txt'),'changed');throw new Error('install failed');});}catch(e){caught=e;}
  expect(caught).toBeInstanceOf(AggregateError);expect(caught.errors.map((e:Error)=>e.message)).toEqual(['install failed','restore denied']);
  expect(existsSync(backup)).toBe(true);expect(readFileSync(join(backup,'old.txt'),'utf8')).toBe('original');expect(caught.message).toContain(backup);
 });
 it('never deletes the last backup when a real filesystem restore fails',()=>{
  const parent=join(dir,'parent'),target=join(parent,'target');mkdirSync(target,{recursive:true});writeFileSync(join(target,'old.txt'),'original');const session=new RollbackSession({targetDir:target,backupParentDir:dir});session.backup();rmSync(parent,{recursive:true});writeFileSync(parent,'not a directory');expect(()=>session.restore()).toThrow('restore');session.cleanup();expect(readFileSync(join(session.backupDir,'old.txt'),'utf8')).toBe('original');
 });
 it('reports disappearance of a known backup instead of pretending there was nothing to restore',()=>{
  const target=join(dir,'target');mkdirSync(target);const session=new RollbackSession({targetDir:target});session.backup();rmSync(session.backupDir,{recursive:true});
  try{expect(()=>session.restore()).toThrow('backup');}finally{session.cleanup();}
 });
});
