import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";

const outDir = path.resolve(process.cwd(), 'tmp_ux_audit', 'run2');
await fs.mkdir(outDir, { recursive: true });

const consoleErrors=[];
const pageErrors=[];
const badResponses=[];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

page.on('console', (msg)=>{ if(['error','warning'].includes(msg.type())) consoleErrors.push({type:msg.type(), text:msg.text()}); });
page.on('pageerror', (err)=> pageErrors.push(String(err)));
page.on('response', async (res)=>{
  const url=res.url();
  const status=res.status();
  if(status>=400 && url.includes('/api/')){
    let body='';
    try{ body=await res.text(); }catch{}
    badResponses.push({url,status,body:body.slice(0,800)});
  }
});

async function snap(name){
  await page.screenshot({ path: path.join(outDir, name), fullPage: true });
}

async function goto(hash){
  await page.goto(`http://localhost:5173/#${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
}

// Signup
const ts=Date.now();
const username=`audit${String(ts).slice(-6)}`;
const email=`audit+${ts}@example.com`;

await goto('/auth');
await page.getByRole('button',{name:'Sign up'}).click();
await page.waitForTimeout(200);
await page.locator('input[name="name"]').fill('Audit User');
await page.locator('input[name="username"]').fill(username);
await page.locator('input[name="email"]').fill(email);
await page.locator('input[name="password"]').fill('Password123!');
await page.locator('input[name="confirmPassword"]').fill('Password123!');
await snap('01_signup_filled.png');
await page.getByRole('button',{name:/create account/i}).click();
await page.waitForTimeout(2500);
await snap('02_after_signup.png');

// Desk
await goto('/desk');
await snap('03_desk.png');

// Threads access + open first thread book
await goto('/threads');
await snap('04_threads_hub.png');
const openThreadBtn = page.getByRole('button', { name: /open thread/i });
if(await openThreadBtn.count()){
  await openThreadBtn.first().click();
  await page.waitForTimeout(1500);
  await snap('05_bookthread_list.png');

  // open composer
  const openDesk = page.getByRole('button',{name:/open writing desk/i});
  if(await openDesk.count()){
    await openDesk.click();
    await page.waitForTimeout(400);
  }
  await page.locator('input[name="title"]').fill('Test thread from audit');
  await page.locator('textarea[name="content"]').fill('This is a test message to verify thread creation works.');
  await snap('06_thread_composed.png');
  await page.getByRole('button',{name:/start discussion/i}).click();
  await page.waitForTimeout(2000);
  await snap('07_thread_after_submit.png');

  // add response to the thread
  const addResponse = page.getByRole('button',{name:/add response/i});
  if(await addResponse.count()){
    await addResponse.first().click();
    await page.waitForTimeout(400);
    await page.locator('form.inline-reply-form textarea').fill('First reply from audit.');
    await snap('08_reply_composed.png');
    await page.getByRole('button',{name:/place response/i}).click();
    await page.waitForTimeout(1500);
    await snap('09_reply_after.png');
  }
}

// Meet + attempt start chat
await goto('/meet');
await snap('10_meet_hub.png');
const startChat = page.getByRole('button',{name:/start chat/i});
if(await startChat.count()){
  await startChat.first().click();
  await page.waitForTimeout(1500);
  await snap('11_meet_room.png');
  // click find partner if present
  const findPartner = page.getByRole('button',{name:/find a reading partner/i});
  if(await findPartner.count()){
    await findPartner.click();
    await page.waitForTimeout(2000);
    await snap('12_meet_searching.png');
  }
}

// Profile -> open profile menu via avatar and sign out
await goto('/');
const menuBtn = page.getByRole('button', { name: /open profile menu/i });
if(await menuBtn.count()){
  await menuBtn.click();
  await page.waitForTimeout(300);
  await snap('13_profile_menu.png');
  const signOut = page.getByRole('button',{name:/sign out/i});
  if(await signOut.count()){
    await signOut.click();
    await page.waitForTimeout(2500);
    await snap('14_after_signout.png');
  }
}

await fs.writeFile(path.join(outDir,'results.json'), JSON.stringify({consoleErrors,pageErrors,badResponses},null,2),'utf8');
await browser.close();
