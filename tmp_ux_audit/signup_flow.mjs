import { chromium } from "playwright";
import fs from "fs/promises";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const api=[];
page.on('response', async (res)=>{
  const url=res.url();
  if(url.includes('/api/')) api.push({url,status:res.status()});
});

const ts=Date.now();
const username=`flow${String(ts).slice(-6)}`;
const email=`flow+${ts}@example.com`;

await page.goto('http://localhost:5173/#/auth', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1000);

await page.getByRole('button',{name:'Sign up'}).click();
await page.waitForTimeout(200);

await page.locator('input[name="name"]').fill('Flow User');
await page.locator('input[name="username"]').fill(username);
await page.locator('input[name="email"]').fill(email);
await page.locator('input[name="password"]').fill('Password123!');
await page.locator('input[name="confirmPassword"]').fill('Password123!');

await page.waitForTimeout(800);
await page.screenshot({path:'tmp_ux_audit/signup_flow_filled.png',fullPage:true});

await page.getByRole('button',{name:/create account/i}).click();

// wait for either navigation away from /auth or error banner
let outcome='unknown';
for(let i=0;i<30;i++){
  const url=page.url();
  const err=await page.locator('.auth-error').count();
  if(err){ outcome='error'; break; }
  if(!url.includes('/#/auth')){ outcome='navigated'; break; }
  await page.waitForTimeout(500);
}

await page.screenshot({path:'tmp_ux_audit/signup_flow_after.png',fullPage:true});
const errorText = (await page.locator('.auth-error').count()) ? await page.locator('.auth-error').innerText() : '';

await fs.writeFile('tmp_ux_audit/signup_flow_result.json', JSON.stringify({outcome, finalUrl: page.url(), errorText, api},null,2), 'utf8');

await browser.close();
