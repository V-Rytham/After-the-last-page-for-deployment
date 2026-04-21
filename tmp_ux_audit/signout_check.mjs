import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const page = await context.newPage();

const bad=[];
const consoleErr=[];
page.on('response', async (res)=>{
  const url=res.url();
  const status=res.status();
  if(status>=400 && url.includes('/api/')){
    let body='';
    try{ body=await res.text(); }catch{}
    bad.push({url,status,body:body.slice(0,300)});
  }
});
page.on('console', (msg)=>{ if(msg.type()==='error') consoleErr.push(msg.text()); });

const ts=Date.now();
const username=`logout${String(ts).slice(-6)}`;
const email=`logout+${ts}@example.com`;

await page.goto('http://localhost:5173/#/auth', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
await page.getByRole('button',{name:'Sign up'}).click();
await page.locator('input[name=name]').fill('Logout User');
await page.locator('input[name=username]').fill(username);
await page.locator('input[name=email]').fill(email);
await page.locator('input[name=password]').fill('Password123!');
await page.locator('input[name=confirmPassword]').fill('Password123!');
await page.getByRole('button',{name:/create account/i}).click();
await page.waitForTimeout(2000);

await page.goto('http://localhost:5173/#/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
await page.getByRole('button',{name:/open profile menu/i}).click();
await page.waitForTimeout(200);
await page.getByRole('button',{name:/sign out/i}).click();
await page.waitForTimeout(3000);

const enterCount = await page.getByRole('button',{name:'Enter'}).count();
const guestErrors = consoleErr.filter((t)=>t.includes('guest session') || t.includes('anonymous'));

console.log(JSON.stringify({enterCount, bad, guestErrors: guestErrors.slice(0,5)}, null, 2));
await browser.close();
