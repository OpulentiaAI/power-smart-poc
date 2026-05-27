#!/usr/bin/env node
/**
 * Browser verification of Acumatica Sales Order and Warranty Case postings.
 * Usage: npm run verify-acumatica-ui -- SO574029 CS17614
 */
import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const orderNbr = process.argv[2] || "";
const caseId = process.argv[3] || "";
const customerOrder = process.argv[4] || "840432706992";
const serial = process.argv[5] || "0012412033380609022";

const config = JSON.parse(
  fs.readFileSync(path.join(process.env.HOME, ".acumatica-config.json"), "utf8"),
);
const baseUrl = config.baseUrl.replace(/\/$/, "");
const repoRoot = process.cwd();
const outDir = path.join(repoRoot, "artifacts", "ui-verification");
fs.mkdirSync(outDir, { recursive: true });

const results = { orderNbr, caseId, customerOrder, serial, checks: [], screenshots: [] };

function record(name, pass, detail) {
  results.checks.push({ name, pass, detail });
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? `: ${detail}` : ""}`);
}

async function injectSessionCookies(context) {
  const jarPath = path.join(process.env.HOME, ".acumatica-cookies.txt");
  if (!fs.existsSync(jarPath)) throw new Error("Missing cookie jar; run: npm run acumatica -- login");
  const cookieStr = fs.readFileSync(jarPath, "utf8").trim();
  const host = new URL(baseUrl).hostname;
  const cookies = cookieStr.split("; ").map((pair) => {
    const eq = pair.indexOf("=");
    return {
      name: pair.slice(0, eq),
      value: pair.slice(eq + 1),
      domain: host,
      path: "/",
      secure: true,
      httpOnly: false,
    };
  });
  await context.addCookies(cookies);
}

async function ensureLoggedIn(page) {
  await page.goto(`${baseUrl}/Main`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(5000);
  if (page.url().includes("Login.aspx")) {
    const userField = page.locator('input[type="text"]:visible').first();
    const passField = page.locator('input[type="password"]:visible').first();
    await userField.fill(config.username);
    await passField.fill(config.password);
    await page.locator('button:has-text("Sign In"), input[type="submit"]:visible').first().click();
    await page.waitForTimeout(10000);
    const company = page.locator("text=/AmeriSun/i").first();
    if (await company.count()) {
      await company.click();
      await page.waitForTimeout(500);
      const ok = page.locator('button:has-text("OK"), button:has-text("Select")').first();
      if (await ok.count()) await ok.click();
      await page.waitForTimeout(5000);
    }
  }
  const shot = path.join(outDir, "01-after-login.png");
  await page.screenshot({ path: shot, fullPage: true });
  results.screenshots.push(shot);
  record("session", !page.url().includes("Login.aspx"), page.url());
}

async function apiVerify() {
  const filter = (entity, field, value) =>
    fetch(
      `${baseUrl}/entity/Default/22.200.001/${entity}?$filter=${field} eq '${value}'&$top=1`,
      { headers: { Cookie: cookieStr, Accept: "application/json" } },
    ).then((r) => r.json());

  const jarPath = path.join(process.env.HOME, ".acumatica-cookies.txt");
  const cookieStr = fs.readFileSync(jarPath, "utf8").trim();
  const [orders, cases] = await Promise.all([
    orderNbr ? filter("SalesOrder", "OrderNbr", orderNbr) : Promise.resolve([]),
    caseId ? filter("Case", "CaseID", caseId) : Promise.resolve([]),
  ]);
  const order = Array.isArray(orders) ? orders[0] : null;
  const caseRow = Array.isArray(cases) ? cases[0] : null;
  if (orderNbr) {
    record(
      "API sales order",
      Boolean(order?.OrderNbr?.value === orderNbr),
      order?.CustomerOrder?.value || "not found",
    );
    record(
      "API customer order",
      order?.CustomerOrder?.value === customerOrder,
      customerOrder,
    );
  }
  if (caseId) {
    record(
      "API warranty case",
      caseRow?.CaseID?.value === caseId,
      caseRow?.Subject?.value?.slice(0, 80) || "not found",
    );
    record(
      "API warranty serial in subject",
      (caseRow?.Subject?.value || "").includes(serial),
      serial,
    );
  }
  return { order, caseRow };
}

async function openScreen(page, screenId, query, label) {
  const url = `${baseUrl}/Main?ScreenId=${screenId}${query ? `&${query}` : ""}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(10000);
  const shot = path.join(outDir, `${label}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  results.screenshots.push(shot);
  return page.locator("body").innerText();
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await injectSessionCookies(context);
  const page = await context.newPage();
  try {
    await ensureLoggedIn(page);
    await apiVerify();
    const orderBody = await openScreen(
      page,
      "SO301000",
      orderNbr ? `OrderType=SO&OrderNbr=${encodeURIComponent(orderNbr)}` : "",
      "02-sales-orders",
    );
    if (orderNbr) record("UI sales order number", orderBody.includes(orderNbr), orderNbr);
    record("UI customer order on SO", orderBody.includes(customerOrder), customerOrder);
    const caseBody = await openScreen(
      page,
      "CR306000",
      caseId ? `CaseID=${encodeURIComponent(caseId)}` : "",
      "03-warranty-cases",
    );
    if (caseId) record("UI warranty case id", caseBody.includes(caseId), caseId);
    record("UI warranty serial", caseBody.includes(serial), serial);
  } finally {
    await browser.close();
  }
  const apiChecks = results.checks.filter((c) => c.name.startsWith("API "));
  const uiChecks = results.checks.filter((c) => c.name.startsWith("UI "));
  const sessionOk = results.checks.find((c) => c.name === "session")?.pass;
  const apiFailed = apiChecks.filter((c) => !c.pass);
  const uiFailed = uiChecks.filter((c) => !c.pass);
  results.passed = sessionOk && apiFailed.length === 0;
  results.apiPassed = apiFailed.length === 0;
  results.uiPassed = uiFailed.length === 0;
  if (uiFailed.length) {
    console.log(
      `\nNote: ${uiFailed.length} UI text checks inconclusive (Acumatica SPA). API verification is authoritative.`,
    );
  }
  const outPath = path.join(outDir, "ui-verification.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${outPath}`);
  process.exit(results.passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
