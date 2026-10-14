const version=process.argv[2],repo=process.env.GITHUB_REPOSITORY,sha=process.env.GITHUB_SHA,token=process.env.GH_TOKEN;
if(!version?.match(/^\d+\.\d+\.\d+-preview\.\d+$/)||repo!=='zackpratamaa/safe-change'||!sha?.match(/^[0-9a-f]{40}$/)||!token)throw new Error('Invalid preview publication context');
const response=await fetch(`https://api.github.com/repos/${repo}/git/ref/tags/v${version}`,{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`}});
if(response.status===200){const ref=await response.json();if(ref.object?.type!=='commit'||ref.object?.sha!==sha)throw new Error('Existing preview tag does not directly identify this tested commit');}
else if(response.status!==404)throw new Error(`Cannot verify preview tag: HTTP ${response.status}`);
