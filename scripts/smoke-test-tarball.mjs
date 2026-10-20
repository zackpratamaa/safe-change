import { mkdir, mkdtemp, readdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

async function main() {
  const repoRoot=resolve('.'), windows=process.platform==='win32';
  const project=await mkdtemp(join(tmpdir(),'sc-clean-install-'));let tarball;
  const records=[];
  const assert=(ok,message)=>{if(!ok)throw new Error(message);records.push(message);};
  const command=(bin,args,cwd=project)=>execFileSync(bin,args,{cwd,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,shell:windows&&bin.endsWith('.cmd'),stdio:['ignore','pipe','pipe']});
  try {
    const npm=windows?'npm.cmd':'npm';
    const packed=JSON.parse(command(npm,['pack','--ignore-scripts','--json'],repoRoot))[0];tarball=join(repoRoot,packed.filename);
    await writeFile(join(project,'package.json'),JSON.stringify({name:'sc-preview-fixture',version:'1.0.0',private:true}));
    command(npm,['install',tarball,'--omit=optional','--ignore-scripts','--no-audit','--no-fund']);
    const installed=join(project,'node_modules','safe-change');const cli=join(installed,'dist','cli.js');
    const run=(...args)=>command(process.execPath,[cli,...args]);
    const expectCode=(code,...args)=>{try{run(...args);assert(code===0,`${args.join(' ')} exit ${code}`);}catch(e){if(e.status!==code)throw e;records.push(`${args.join(' ')} exit ${code}`);return e.stdout?.toString();}};
    const version=JSON.parse(await readFile(join(repoRoot,'package.json'),'utf8')).version;
    assert(run('--version').includes(version),'installed CLI version matches tarball');
    assert((await readFile(join(installed,'tools','java','JavaSourceCheck.java'),'utf8')).includes('class JavaSourceCheck'),'Java source helper ships in the tarball');
    assert((await readFile(join(installed,'docs','getting-started.md'),'utf8')).includes('safe-change doctor'),'getting-started guide ships in the tarball');
    const diagnostic=JSON.parse(run('doctor','--json'));
    assert(diagnostic.schemaVersion===1&&diagnostic.scope==='local-readiness','packaged doctor returns a machine-readable readiness report');
    assert(diagnostic.checks.some(item=>item.id==='node'),'doctor includes Node runtime inspection');
    command('git',['init']);command('git',['config','user.name','SafeChangePreview']);command('git',['config','user.email','preview@example.invalid']);
    await writeFile(join(project,'.gitignore'),'node_modules/\n.safe-change/\n');
    run('init','--json');
    await writeFile(join(project,'app.json'),'{"value":1}\n');
    await writeFile(join(project,'check.mjs'),"import fs from 'node:fs';process.exit(JSON.parse(fs.readFileSync('app.json','utf8')).value===1?0:1);\n");
    await writeFile(join(project,'.safe-change.json'),JSON.stringify({version:1,checks:[{name:'behavior',executable:process.execPath,args:['check.mjs'],timeout:30}]}));
    await writeFile(join(project,'quality-policy.json'),JSON.stringify({version:1,requiredChecks:['behavior'],maxAgeSeconds:3600}));
    await writeFile(join(project,'contract.json'),JSON.stringify({version:1,intent:'Preserve fixture behavior',allowedPaths:['app.json'],protectedPaths:['check.mjs'],requirements:[{id:'R1',description:'Existing behavior preserved',checks:['behavior']}],nonGoals:['No check rewrite']}));
    command('git',['add','.']);command('git',['commit','-m','clean fixture']);
    run('save','pre-change fixture','--json');assert(JSON.parse(run('check','--strict','--json')).verification.state==='verified','strict clean verification');
    assert(JSON.parse(run('quality','gate','--file','quality-policy.json','--json')).status==='PASS','current quality gate');
    run('session','start','preview-task','--file','contract.json','--json');
    assert(JSON.parse(run('session','hook','preview-task','before-edit','--json')).hookSpecificOutput.permissionDecision==='ask','hook asks before a timing choice');
    assert(JSON.parse(run('session','hook','preview-task','before-finish','--json')).decision==='block','hook blocks unresolved completion');
    expectCode(3,'session','decide','preview-task');
    await writeFile(join(project,'app.json'),'{"value":2}\n');
    expectCode(1,'check','--strict','--json');expectCode(1,'quality','gate','--file','quality-policy.json','--json');
    await writeFile(join(project,'outside-scope.txt'),'controlled scope violation');
    assert(JSON.parse(run('session','hook','preview-task','before-edit','--json')).hookSpecificOutput.permissionDecision==='deny','hook denies observed scope violation');
    const sdk=join(project,'node_modules','@modelcontextprotocol','sdk','dist','esm','client');
    const {Client}=await import(pathToFileURL(join(sdk,'index.js')).href);
    const {StdioClientTransport}=await import(pathToFileURL(join(sdk,'stdio.js')).href);
    const client=new Client({name:'clean-package-preview-test',version:'1.0.0'},{capabilities:{}});
    const transport=new StdioClientTransport({command:process.execPath,args:[cli,'mcp'],cwd:project,stderr:'pipe'});
    try {
      await client.connect(transport);assert((await client.listTools()).tools.length===5,'packaged stdio MCP discovers five tools');
      const result=await client.callTool({name:'safe_change_check',arguments:{cwd:project,strict:true}});
      const text=result.content?.find(c=>c.type==='text')?.text;
      assert(text&&JSON.parse(text).verification.state==='failed','packaged MCP reports controlled regression');
    } finally {await client.close();await transport.close();}
    if(process.env.SAFE_CHANGE_TEST_PACKAGED_JAVA==='1') {
      const java=process.env.JAVA_HOME?join(process.env.JAVA_HOME,'bin',windows?'java.exe':'java'):'java';
      const source=join(project,'java-source');await mkdir(source);
      const helper=join(installed,'tools','java','JavaSourceCheck.java');
      await writeFile(join(source,'Greeting.java'),'public final class Greeting { public static String value() { return "ok"; } }\n');
      assert(command(java,[helper,source]).includes('Java compilation passed'),'installed Java helper compiles valid source');
      await writeFile(join(source,'Greeting.java'),'public final class Greeting { public static String value() { return 123; } }\n');
      let rejected=false;try{command(java,[helper,source]);}catch(error){if(error.status!==1)throw error;rejected=true;}
      assert(rejected,'installed Java helper rejects a compilation regression');
      assert((await readdir(source)).join(',')==='Greeting.java','installed Java helper leaves no class files in source');
    }
    console.log(JSON.stringify({status:'PASS',version,records,limits:['TypeScript fallback installation (--omit=optional); no native distribution certification','Hook protocol and actual stdio MCP, not a live IDE/agent consent test']}));
    console.log('ALL SMOKE TESTS PASSED SUCCESSFULLY!');
  } finally {await rm(project,{recursive:true,force:true});if(tarball)await rm(tarball,{force:true});}
}
main().catch(error=>{console.error('SMOKE TEST FAILED:',error.message);process.exit(1);});
