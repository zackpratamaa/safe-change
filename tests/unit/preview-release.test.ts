import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildPublishArgs } from '../../scripts/publish-orchestrator.mjs';
describe('preview publication isolation',()=>{
 it('keeps preview workflow out of npm and latest, requiring independent CI',()=>{
  const workflow=readFileSync('.github/workflows/preview.yml','utf8');expect(workflow).toContain('--prerelease --latest=false');expect(workflow).toContain('wait-preview-checks.mjs');expect(workflow).not.toContain('npm publish');expect(workflow).toContain('persist-credentials: false');
  const gate=readFileSync('scripts/wait-preview-checks.mjs','utf8');expect(gate).toContain('github-actions');expect(gate).toContain('github-advanced-security');expect(gate).toContain('r.head_sha===sha');
  for(const match of workflow.matchAll(/uses: ([^\s]+)/g))expect(match[1]).toMatch(/@[0-9a-f]{40}$/);
 });
 it('never publishes prereleases under the latest npm tag',()=>{
  expect(buildPublishArgs('a.tgz','1.1.0-preview.1',false)).toEqual(['publish','a.tgz','--access','public','--tag','preview']);
  expect(buildPublishArgs('a.tgz','1.1.0-beta.2',true)).toContain('--provenance');
  expect(buildPublishArgs('a.tgz','1.1.0+build-test',false)).toContain('latest');
  expect(()=>buildPublishArgs('a.tgz','bad',false)).toThrow();
 });
});
