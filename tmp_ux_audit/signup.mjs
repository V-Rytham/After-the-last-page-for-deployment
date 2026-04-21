import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const badResponses=[];
page.on('response', async (res)=>{
  const url=res.url();
  const status=res.status();
  if(status>=400 && url.includes('/api/')){
    let body='';
    try{ body=await res.text(); }catch{}
    badResponses.push({url,status,body:body.slice(0,500)});
  }
});

const ts = Date.now();
const username = `testuser${String(ts).slice(-6)}`;
const email = `test+${ts}@example.com`;

await page.goto('http://localhost:5173/#/auth', { waitUntil: 'networkidle' });

const signupToggle = page.getByRole('button', { name: /sign up/i });
if(await signupToggle.count()) await signupToggle.first().click();

await page.locator('input[name="name"]').fill('Test User');
await page.locator('input[name="email"]').fill(email);
await page.locator('input[name="username"]').fill(username);
await page.locator('input[name="password"]').fill('Password123!');

await page.screenshot({ path: 'tmp_ux_audit/signup_filled.png', fullPage: true });

const submit = page.getByRole('button', { name: /sign up|create account|continue/i });
if(await submit.count()) await submit.first().click();

await page.waitForTimeout(2500);
await page.screenshot({ path: 'tmp_ux_audit/signup_after.png', fullPage: true });

console.log('url', page.url());
console.log('badResponses', JSON.stringify(badResponses,null,2));

await browser.close();
