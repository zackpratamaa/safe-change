/** Fail-closed release prerequisite, excluding this workflow's own jobs. */
const required = ['Package Tarball Smoke Test','CodeQL','Lint, Build, and Test (macos-latest)','Lint, Build, and Test (windows-latest)','Lint, Build, and Test (ubuntu-latest)','Build & Test (linux-x64-gnu)','Build & Test (win32-x64-msvc)','Build & Test (darwin-arm64)','Build & Test (darwin-x64)','Security Gate & Version Parity','CodeQL Analysis (javascript-typescript)'];
const repo=process.env.GITHUB_REPOSITORY, sha=process.env.GITHUB_SHA, token=process.env.GH_TOKEN;
if(repo!=='zackpratamaa/safe-change'||!sha?.match(/^[0-9a-f]{40}$/)||!token)throw new Error('Expected authorized repository, immutable SHA and workflow token');
let passed=false;
for(let attempt=0;attempt<60;attempt++){
 const response=await fetch(`https://api.github.com/repos/${repo}/commits/${sha}/check-runs?per_page=100`,{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`}});
 if(!response.ok)throw new Error(`Cannot verify release checks: HTTP ${response.status}`);
 const data=await response.json();if(!Array.isArray(data.check_runs))throw new Error('Malformed check-run response');
 const selected=required.map(name=>data.check_runs.find(r=>r.name===name&&r.head_sha===sha&&r.app?.slug===(name==='CodeQL'?'github-advanced-security':'github-actions')));
 if(selected.some(r=>r?.status==='completed'&&r.conclusion!=='success'))throw new Error('A required same-commit check did not succeed; preview publication blocked');
 if(selected.every(r=>r?.status==='completed'&&r.conclusion==='success')){passed=true;break;}
 await new Promise(resolve=>setTimeout(resolve,20000));
}
if(!passed)throw new Error('Required same-commit checks incomplete; preview publication blocked');
console.log(`All ${required.length} required checks succeeded for ${sha}`);
