import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const tools=process.env.SAFE_CHANGE_BROWSER_TOOLS;
if(!tools) throw new Error('Set SAFE_CHANGE_BROWSER_TOOLS to the isolated node_modules directory containing pinned playwright and axe-core');
const { chromium } = await import(pathToFileURL(resolve(tools,'playwright/index.mjs')).href);
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDashboardServer } from '../dist/dashboard/server.js';
const root=await mkdtemp(join(tmpdir(),'sc-browser-'));const instance=await startDashboardServer({port:0,repoRoot:root});
const browser=await chromium.launch({executablePath:process.env.SAFE_CHANGE_CHROMIUM,headless:true,args:['--no-sandbox']});
let result;
try {
 const page=await browser.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(instance.url);await page.waitForSelector('.tab-btn');
 const cases=[];
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.locator('[data-tab="semantic"]').click();
  cases.push({case:`tab-click-${width}`,passed:await page.locator('#pane-semantic').evaluate(e=>e.classList.contains('active'))});
  await page.locator('[data-tab="overview"]').focus();await page.keyboard.press('Enter');
  cases.push({case:`keyboard-activation-${width}`,passed:await page.locator('#pane-overview').evaluate(e=>e.classList.contains('active'))});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);cases.push({case:`no-page-overflow-${width}`,passed:!overflow});
 }
 await page.addScriptTag({content:await readFile(resolve(tools,'axe-core/axe.min.js'),'utf8')});
 const axe=await page.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));});
 result={browser:'system Chromium via Playwright',localOnly:true,cases,pageErrors:errors,axeViolations:axe,limitations:['Chromium only; no screen-reader or cross-browser certification','Dashboard browser test is not an IDE agent integration test']};
 console.log(JSON.stringify(result));
 if(result.cases.some(c=>!c.passed)||result.pageErrors.length||result.axeViolations.length) process.exitCode=1;
}finally{await browser.close();await instance.close();await rm(root,{recursive:true,force:true});}
