import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";

const outDir = path.resolve(process.cwd(), 'tmp_ux_audit', 'run3');
await fs.mkdir(outDir, { recursive: true });

const findings=[];
const consoleErrors=[];
const badResponses=[];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

page.on('console', (msg)=>{ if(['error','warning'].includes(msg.type())) consoleErrors.push({type:msg.type(), text:msg.text()}); });
page.on('response', async (res)=>{
  const url=res.url();
  const status=res.status();
  if(status>=400 && url.includes('/api/')){
    let body='';
    try{ body=await res.text(); }catch{}
    badResponses.push({url,status,body:body.slice(0,500)});
  }
});

async function snap(name){ await page.screenshot({path:path.join(outDir,name), fullPage:true}); }
async function goto(hash){ await page.goto(`http://localhost:5173/#${hash}`, {waitUntil:'domcontentloaded'}); await page.waitForTimeout(1200); }

// Create user via UI (covers auth UX)
const ts=Date.now();
const username=`ux${String(ts).slice(-6)}`;
const email=`ux+${ts}@example.com`;
await goto('/auth');
await page.getByRole('button',{name:'Sign up'}).click();
await page.locator('input[name=name]').fill('UX Reviewer');
await page.locator('input[name=username]').fill(username);
await page.locator('input[name=email]').fill(email);
await page.locator('input[name=password]').fill('Password123!');
await page.locator('input[name=confirmPassword]').fill('Password123!');
await snap('01_auth_signup.png');
await page.getByRole('button',{name:/create account/i}).click();
await page.waitForTimeout(2500);
await snap('02_after_signup.png');

// Visit major sections via nav
const navTargets=[
  {label:'Your desk', hash:'/desk', waitFor:'.desk-page'},
  {label:'Library', hash:'/library', waitFor:'.library-page'},
  {label:'Meet', hash:'/meet', waitFor:'.meeting-access-page'},
  {label:'Threads', hash:'/threads', waitFor:'.thread-access-page'},
  {label:'Studio', hash:'/merch', waitFor:'.wizard-merch'}
];

for(const t of navTargets){
  await goto(t.hash);
  await snap(`nav_${t.label.replace(/\s+/g,'_')}.png`);
  const has = await page.locator(t.waitFor).count();
  if(!has){ findings.push({location:t.label, action:'Navigate via navbar', expected:`Page root ${t.waitFor} visible`, actual:'Root element not found', severity:'High'}); }
}

// Profile + Settings via avatar
await goto('/desk');
const menuBtn=page.getByRole('button',{name:/open profile menu/i});
if(await menuBtn.count()){
  await menuBtn.click();
  await page.waitForTimeout(300);
  await snap('profile_menu.png');
  const view=page.getByRole('button',{name:/view profile/i});
  if(await view.count()){
    await view.click();
    await page.waitForTimeout(1200);
    await snap('profile_page.png');
  }
}

await goto('/settings');
await snap('settings_page.png');

// Reading flow: open a common gutenberg read route
await goto('/read/gutenberg/1342');
await page.waitForTimeout(2500);
await snap('reading_room_1342.png');

// Quiz flow
await goto('/quiz/gutenberg:1342');
await page.waitForTimeout(2500);
await snap('quiz_1342.png');

await fs.writeFile(path.join(outDir,'telemetry.json'), JSON.stringify({findings, consoleErrors, badResponses},null,2),'utf8');
await browser.close();
