import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";

const outDir = path.resolve(process.cwd(), "tmp_ux_audit");
await fs.mkdir(outDir, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const requestFailures = [];
const badResponses = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

page.on("console", (msg) => {
  if (["error", "warning"].includes(msg.type())) {
    consoleErrors.push({ type: msg.type(), text: msg.text() });
  }
});
page.on("pageerror", (err) => pageErrors.push(String(err)));
page.on("requestfailed", (req) => requestFailures.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText }));
page.on("response", async (res) => {
  const url = res.url();
  const status = res.status();
  if (status >= 400 && url.includes("/api/")) {
    let body = "";
    try { body = await res.text(); } catch {}
    badResponses.push({ url, status, body: body.slice(0, 500) });
  }
});

async function snap(name) {
  await page.screenshot({ path: path.join(outDir, name), fullPage: true });
}

async function goto(hashPath) {
  const url = `http://localhost:5173/#${hashPath}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
}

async function clickNav(label) {
  const link = page.getByRole("link", { name: label });
  if (await link.count()) {
    await link.first().click();
    await page.waitForTimeout(700);
    return true;
  }
  return false;
}

const run = async () => {
  await goto("/");
  await snap("01_home.png");

  await clickNav("Meet");
  await snap("02_meet.png");

  await clickNav("Threads");
  await snap("03_threads.png");

  // Auth entry
  const enterBtn = page.getByRole("button", { name: "Enter" });
  if (await enterBtn.count()) {
    await enterBtn.click();
    await page.waitForTimeout(900);
  }
  await snap("04_auth.png");

  // Try signup toggle
  const signupToggle = page.getByRole("button", { name: /sign up/i });
  if (await signupToggle.count()) {
    await signupToggle.first().click();
    await page.waitForTimeout(500);
  }

  const fillByName = async (name, value) => {
    const input = page.locator(`input[name="${name}"]`);
    if (await input.count()) {
      await input.first().fill(value);
      return true;
    }
    return false;
  };

  await fillByName("name", "");
  await fillByName("email", "not-an-email");
  await fillByName("username", "ab");
  await fillByName("password", "123");
  await snap("05_signup_invalid.png");

  const submit = page.getByRole("button", { name: /sign up|create account|continue/i });
  if (await submit.count()) {
    await submit.first().click();
    await page.waitForTimeout(1200);
  }
  await snap("06_after_submit.png");

  // Meet again
  await goto("/meet");
  await snap("07_meet_after_auth.png");

  const startChat = page.getByRole("button", { name: /start chat/i });
  if (await startChat.count()) {
    await startChat.first().click();
    await page.waitForTimeout(1500);
    await snap("08_meet_start_chat.png");
  }

  // Threads again
  await goto("/threads");
  await snap("09_threads_after_auth.png");

  await browser.close();

  await fs.writeFile(path.join(outDir, "network_console.json"), JSON.stringify({ consoleErrors, pageErrors, requestFailures, badResponses }, null, 2), "utf8");
};

await run();


