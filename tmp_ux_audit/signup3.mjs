import { chromium } from "playwright";
import fs from "fs/promises";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const api=[];
page.on('response', async (res)=>{
  const url=res.url();
  if(url.includes('/api/')){
    api.push({url,status:res.status()});
  }
});

const ts=Date.now();
const username=`reviewer${String(ts).slice(-6)}`;
const email=`reviewer+${ts}@example.com`;

await page.goto('http://localhost:5173/#/auth', { waitUntil: 'networkidle' });
await page.getByRole('button',{name:/sign up/i}).click();

await page.locator('input[name="name"]').fill('Reviewer');
await page.locator('input[name="username"]').fill(username);
await page.locator('input[name="email"]').fill(email);
await page.locator('input[name="password"]').fill('Password123!');
await page.locator('input[name="confirmPassword"]').fill('Password123!');

await page.waitForTimeout(500);
await page.screenshot({path:'tmp_ux_audit/signup3_filled.png',fullPage:true});

await page.getByRole('button',{name:/create account/i}).click();
await page.waitForTimeout(2500);

await page.screenshot({path:'tmp_ux_audit/signup3_after.png',fullPage:true});
await fs.writeFile('tmp_ux_audit/signup3_api.json', JSON.stringify(api,null,2), 'utf8');
console.log('final',page.url());
await browser.close();
