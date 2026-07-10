#!/usr/bin/env node
/**
 * Power Smart Acumatica CLI — `ps-acumatica`
 *
 * Built against Acumatica Contract-Based REST API (v22.200.001+).
 * Auth: cookie-based session (primary) with OAuth ROPC when a Connected App exists.
 *
 * Contract: results are JSON on stdout so they pipe cleanly. Progress and hints
 * are plain sentences on stderr so an agent can quote them to the user while
 * narrating a run. Pass --quiet to silence the narration.
 */
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import * as readline from "readline";

// ─── Types ───────────────────────────────────────────────────────────

interface AcumaticaConfig {
  baseUrl: string;
  tenant: string;
  username: string;
  password: string;
  company?: string;
  branch?: string;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
  auth?: string;
}

// ─── Config ──────────────────────────────────────────────────────────
const CONFIG_PATH =
  process.env.ACUMATICA_CONFIG ||
  path.join(process.env.HOME || "/root", ".acumatica-config.json");
const COOKIE_JAR_PATH = path.join(process.env.HOME || "/root", ".acumatica-cookies.txt");

let QUIET = false;

/** Progress narration on stderr. Stdout stays pure JSON. */
function say(message: string): void {
  if (!QUIET) console.error(message);
}

function fail(error: string, hint?: string): never {
  console.error(JSON.stringify(hint ? { error, hint } : { error }));
  process.exit(1);
}

function loadConfig(): AcumaticaConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    fail(
      `Config not found at ${CONFIG_PATH}`,
      "Run: npm run acumatica -- config   (or set ACUMATICA_CONFIG to a config file path)",
    );
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

// ─── Auth: Cookie-based (Session) ────────────────────────────────────

async function cookieLogin(config: AcumaticaConfig): Promise<string> {
  // Use curl for reliable Set-Cookie capture (Node.js fetch header API is inconsistent)
  const company = config.company || "AmeriSun Inc. - Test";
  const tmpJar = `/tmp/acumatica-cookie-login-${Date.now()}.txt`;
  try {
    execSync(
      `curl -s -k -c "${tmpJar}" -X POST "${config.baseUrl}/entity/auth/login" ` +
      `-H "Content-Type: application/json; charset=utf-8" ` +
      `-d '{"name":"${config.username}","password":"${config.password}","company":"${company}"}' ` +
      `-o /dev/null -w "%{http_code}"`,
      { timeout: 15000 }
    );
    // Parse Netscape cookie jar
    const jarContent = fs.readFileSync(tmpJar, "utf-8");
    const cookies: string[] = [];
    for (const line of jarContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || (trimmed.startsWith("#") && !trimmed.includes("HttpOnly"))) continue;
      const cleaned = trimmed.replace("#HttpOnly_", "");
      const parts = cleaned.split("\t");
      if (parts.length >= 7) cookies.push(`${parts[5]}=${parts[6]}`);
    }
    if (cookies.length === 0) throw new Error("No session cookies returned");
    const cookieStr = cookies.join("; ");
    fs.writeFileSync(COOKIE_JAR_PATH, cookieStr);
    return cookieStr;
  } finally {
    try { fs.unlinkSync(tmpJar); } catch {}
  }
}

function loadCookies(): string | null {
  if (!fs.existsSync(COOKIE_JAR_PATH)) return null;
  const cookies = fs.readFileSync(COOKIE_JAR_PATH, "utf-8").trim();
  if (!cookies) return null;
  try {
    const stat = fs.statSync(COOKIE_JAR_PATH);
    if (Date.now() - stat.mtimeMs > 60 * 60 * 1000) {
      say("Session cookies are older than one hour and may be expired. Run: npm run acumatica -- login");
    }
  } catch {}
  return cookies;
}

// ─── Auth: OAuth ROPC ────────────────────────────────────────────────

async function getAccessToken(config: AcumaticaConfig): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "password",
    client_id: "api",
    username: config.username,
    password: config.password,
    scope: "api offline_access",
    tenant: config.tenant,
  });
  if (config.company) params.append("company", config.company);
  if (config.branch) params.append("branch", config.branch);

  const response = await fetch(`${config.baseUrl}/identity/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Auth failed (${response.status}): ${body.substring(0, 300)}`);
  }
  const data = await response.json();
  return data.access_token;
}

// ─── API Request (OAuth-first, cookie fallback) ──────────────────────

function wrap(v: string | number | boolean) { return { value: v }; }

async function apiRequest(endpoint: string, method: string, body?: Record<string, unknown>): Promise<ApiResponse> {
  const config = loadConfig();
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  let authMethod = "none";

  // Try OAuth first, fall back to cookie auth
  try {
    const token = await getAccessToken(config);
    headers["Authorization"] = `Bearer ${token}`;
    authMethod = "oauth";
  } catch (oauthErr: any) {
    const cookieStr = loadCookies();
    if (!cookieStr) {
      return { success: false, error: `OAuth failed (${oauthErr.message}) and no session cookies found. Run: npm run acumatica -- login` };
    }
    headers["Cookie"] = cookieStr;
    authMethod = "cookie";
  }

  const url = `${config.baseUrl}/entity/Default/22.200.001/${endpoint}`;
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) return { success: false, statusCode: response.status, error: text };
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { success: true, statusCode: response.status, data: parsed, auth: authMethod };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function apiPut(endpoint: string, body: Record<string, unknown>): Promise<ApiResponse> {
  return apiRequest(endpoint, "PUT", body);
}

// ─── Screen URLs (for browser milestones) ────────────────────────────

const SCREENS: Record<string, { screenId: string; label: string; param?: (id: string) => string }> = {
  "sales-order": {
    screenId: "SO301000",
    label: "Sales Orders entry screen",
    param: (id) => `OrderType=SO&OrderNbr=${encodeURIComponent(id)}`,
  },
  "invoice": {
    screenId: "SO303000",
    label: "Sales Order Invoices screen",
    param: (id) => `DocType=INV&RefNbr=${encodeURIComponent(id)}`,
  },
  "case": {
    screenId: "CR306000",
    label: "Cases entry screen",
    param: (id) => `CaseID=${encodeURIComponent(id)}`,
  },
};

function screenUrl(screen: string, id?: string): { screen: string; screenId: string; label: string; url: string } {
  const def = SCREENS[screen];
  if (!def) {
    fail(
      `Unknown screen: ${screen}`,
      `Known screens: ${Object.keys(SCREENS).join(", ")}. Example: npm run acumatica -- url sales-order SO574027`,
    );
  }
  const config = loadConfig();
  const base = config.baseUrl.replace(/\/$/, "");
  const query = id && def.param ? `&${def.param(id)}` : "";
  return {
    screen,
    screenId: def.screenId,
    label: def.label,
    url: `${base}/Main?ScreenId=${def.screenId}${query}`,
  };
}

// ─── Sales Order Input ──────────────────────────────────────────────

interface SalesOrderInput {
  customerName: string;
  phone: string;
  email: string;
  address: string;
  platform: string;
  orderNumber: string;
  orderedDate: string;
  productCategory: string;
  modelSku: string;
  serialNumber: string;
  customerId?: string;
}

function resolveCustomerId(order: SalesOrderInput): { id: string; source: string } {
  if (order.customerId) return { id: order.customerId, source: "input" };

  const retailer = `${order.platform} ${order.customerName}`.toLowerCase();
  if (retailer.includes("home") && retailer.includes("depot")) {
    const isCanada = /\b(on|ab|bc|mb|nb|nl|ns|nt|nu|pe|qc|sk|yt)\b/i.test(order.address);
    return { id: isCanada ? "C00006" : "C00008", source: isCanada ? "home_depot_canada" : "home_depot_us" };
  }
  if (retailer.includes("amazon")) return { id: "C00002", source: "amazon" };
  if (retailer.includes("walmart")) return { id: "C00009", source: "walmart" };

  return { id: "C00001", source: "default_vendor_central" };
}

async function pushSalesOrder(order: SalesOrderInput, customerId?: string): Promise<ApiResponse> {
  const resolvedCustomer = customerId || resolveCustomerId(order).id;
  const body = {
    OrderType: wrap("SO"),
    OrderNbr: wrap("<NEW>"),
    CustomerID: wrap(resolvedCustomer),
    CustomerOrder: wrap(order.orderNumber),
    Date: wrap(order.orderedDate),
    RequestedOn: wrap(order.orderedDate),
    Description: wrap(`Power Smart — ${order.platform} — ${order.productCategory}`),
    Note: wrap([
      `Customer: ${order.customerName}`, `Phone: ${order.phone}`,
      `Address: ${order.address}`, `Platform: ${order.platform}`,
      `Model/SKU: ${order.modelSku}`, `Serial: ${order.serialNumber}`,
    ].join("\n")),
  };
  return apiPut("SalesOrder", body);
}

// ─── Warranty Case Input ─────────────────────────────────────────────

interface WarrantyCaseInput {
  claimantName: string; phone: string; email: string; address: string;
  productCategory: string; modelSku: string; serialNumber: string;
  platform: string; orderNumber?: string; purchaseDate?: string;
  validationResult: string; validationNotes: string;
}

async function pushWarrantyCase(caseData: WarrantyCaseInput): Promise<ApiResponse> {
  const body = {
    CaseClass: wrap("RQ"),
    Subject: wrap(`Warranty Claim — ${caseData.claimantName} — ${caseData.serialNumber}`),
    Description: wrap([
      `Claimant: ${caseData.claimantName}`, `Phone: ${caseData.phone}`,
      `Email: ${caseData.email}`, `Address: ${caseData.address}`,
      `Product: ${caseData.productCategory} | Model: ${caseData.modelSku}`,
      `Serial: ${caseData.serialNumber}`, `Retailer: ${caseData.platform}`,
      caseData.orderNumber ? `Order #: ${caseData.orderNumber}` : "",
      caseData.purchaseDate ? `Purchase Date: ${caseData.purchaseDate}` : "",
      "", `Validation: ${caseData.validationResult.toUpperCase()}`,
      `Notes: ${caseData.validationNotes}`,
    ].filter(Boolean).join("\n")),
    Severity: wrap(caseData.validationResult === "escalated" ? "High" : "Medium"),
  };
  return apiPut("Case", body);
}

// ─── Payload input (file, positional path, or stdin) ─────────────────

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    const { stdin } = process; stdin.setEncoding("utf-8");
    stdin.on("readable", () => { let chunk; while ((chunk = stdin.read()) !== null) data += chunk; });
    stdin.on("end", () => resolve(data.trim()));
    if (stdin.isTTY) resolve("");
  });
}

async function readPayload(args: string[], shape: string): Promise<any> {
  const fileFlag = args.indexOf("--file");
  const filePath = fileFlag !== -1 ? args[fileFlag + 1] : args.find((a) => !a.startsWith("-"));
  let raw: string;
  let source: string;
  if (filePath) {
    if (!fs.existsSync(filePath)) fail(`Payload file not found: ${filePath}`);
    raw = fs.readFileSync(filePath, "utf-8").trim();
    source = filePath;
  } else {
    raw = await readStdin();
    source = "stdin";
  }
  if (!raw) {
    fail(
      `No payload. Expected ${shape} JSON.`,
      "Pass a file (--file artifacts/acumatica-payload.json), a bare path, or pipe JSON via stdin.",
    );
  }
  try {
    const parsed = JSON.parse(raw);
    say(`Read ${shape} payload from ${source}.`);
    return parsed;
  } catch (err: any) {
    fail(`Payload from ${source} is not valid JSON: ${err.message}`);
  }
}

function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

// ─── Commands ────────────────────────────────────────────────────────

async function cmdStatus(): Promise<void> {
  try {
    const config = loadConfig();
    const result = await apiRequest("Customer?$top=1", "GET");
    if (result.success) {
      const data = Array.isArray(result.data) ? result.data : [];
      console.log(JSON.stringify({
        status: "connected",
        tenant: config.tenant,
        auth: result.auth || "unknown",
        entityTest: data.length > 0 ? "OK" : "unexpected",
        sampleCustomer: (data[0] as any)?.CustomerName?.value || "N/A",
      }, null, 2));
    } else {
      console.log(JSON.stringify({
        status: "error",
        tenant: config.tenant,
        error: result.error || "Unknown error"
      }, null, 2));
      process.exit(1);
    }
  } catch (err: any) {
    console.log(JSON.stringify({ status: "disconnected", error: err.message }, null, 2));
    process.exit(1);
  }
}

async function cmdLogin(): Promise<void> {
  try {
    const config = loadConfig();
    say(`Logging in to ${config.baseUrl} (tenant ${config.tenant}) with a cookie session.`);
    await cookieLogin(config);
    console.log(JSON.stringify({ status: "logged_in", tenant: config.tenant, cookieJar: COOKIE_JAR_PATH }, null, 2));
    // Verify session works by testing entity access
    const result = await apiRequest("Customer?$top=1", "GET");
    if (result.success) {
      say("Session verified. Entity access confirmed with a Customer read.");
    }
  } catch (err: any) {
    console.log(JSON.stringify({ status: "login_failed", error: err.message }, null, 2));
    process.exit(1);
  }
}

function cmdSetupConnectedApp(): void {
  const config = loadConfig();
  console.log(`Connected Application setup (needed for OAuth only; cookie login works without it)

Cookie-based auth already works via POST /entity/auth/login.
To enable OAuth ROPC, create a Connected Application once:

  1. Log into the sandbox: ${config.baseUrl}/
  2. Open the Connected Applications screen (SM303010).
  3. Add a new Connected Application:
       Client Name: ps-acumatica-cli
       Client ID:   api
       Flow:        Resource Owner Password Credentials
       Scopes:      api, offline_access
  4. Save. The client secret is shown once; store it securely.
  5. Run: npm run acumatica -- login`);
}

function cmdConfig(): void {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>(r => rl.question(q, r));
  (async () => {
    const config: AcumaticaConfig = {
      baseUrl: await ask("Base URL: "), tenant: await ask("Tenant: "),
      username: await ask("Username: "), password: await ask("Password: "),
    };
    const company = await ask("Company (optional): ");
    if (company) config.company = company;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(`\nConfig saved to ${CONFIG_PATH}`);
    rl.close(); process.exit(0);
  })();
}

function cmdShowConfig(): void {
  if (!fs.existsSync(CONFIG_PATH)) { console.log("No config."); process.exit(0); }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  console.log(JSON.stringify({ ...cfg, password: "***" }, null, 2));
}

async function cmdPushOrder(args: string[]): Promise<void> {
  const order: SalesOrderInput = await readPayload(args, "order");
  const cust = resolveCustomerId(order);
  say(`Order ${order.orderNumber} for ${order.customerName} (${order.platform}).`);
  say(`Resolved customer ${cust.id} (${cust.source}).`);
  say("Pushing the sales order to Acumatica now.");
  const result = await pushSalesOrder(order, cust.id);
  console.log(JSON.stringify({ ...result, customer: cust }, null, 2));
  if (result.success) {
    const orderNbr = (result.data as any)?.OrderNbr?.value;
    if (orderNbr) {
      say(`Created sales order ${orderNbr}.`);
      say(`Show it in the browser: npm run acumatica -- url sales-order ${orderNbr}`);
      say(`Verify it end to end: npm run verify-acumatica-ui -- ${orderNbr} "" ${order.orderNumber} ${order.serialNumber}`);
    }
  }
  process.exit(result.success ? 0 : 1);
}

async function cmdPushWarranty(args: string[]): Promise<void> {
  const caseData: WarrantyCaseInput = await readPayload(args, "warranty");
  say(`Warranty claim for ${caseData.claimantName}, serial ${caseData.serialNumber}, validation ${caseData.validationResult}.`);
  say("Pushing the warranty case to Acumatica now.");
  const result = await pushWarrantyCase(caseData);
  console.log(JSON.stringify(result, null, 2));
  if (result.success) {
    const caseId = (result.data as any)?.CaseID?.value || (result.data as any)?.CaseCD?.value;
    if (caseId) {
      say(`Created warranty case ${caseId}.`);
      say(`Show it in the browser: npm run acumatica -- url case ${caseId}`);
    }
  }
  process.exit(result.success ? 0 : 1);
}

async function cmdPushBoth(args: string[]): Promise<void> {
  const payload: { order: SalesOrderInput; warranty: WarrantyCaseInput } = await readPayload(args, "{order, warranty}");
  if (!payload.order || !payload.warranty) {
    fail("Payload must contain both an order object and a warranty object.", "Shape: {\"order\": {...}, \"warranty\": {...}}");
  }
  const cust = resolveCustomerId(payload.order);
  say(`Resolved customer ${cust.id} (${cust.source}).`);
  say("Pushing the sales order first, then the warranty case.");
  const orderResult = await pushSalesOrder(payload.order, cust.id);
  const warrantyResult = await pushWarrantyCase(payload.warranty);
  const orderNbr = (orderResult.data as any)?.OrderNbr?.value;
  const caseId = (warrantyResult.data as any)?.CaseID?.value || (warrantyResult.data as any)?.CaseCD?.value;
  console.log(JSON.stringify({
    success: orderResult.success && warrantyResult.success,
    customer: cust,
    order: orderResult,
    warranty: warrantyResult,
  }, null, 2));
  if (orderNbr) say(`Created sales order ${orderNbr}. Show it: npm run acumatica -- url sales-order ${orderNbr}`);
  if (caseId) say(`Created warranty case ${caseId}. Show it: npm run acumatica -- url case ${caseId}`);
  process.exit(orderResult.success && warrantyResult.success ? 0 : 1);
}

async function cmdLookupOrder(args: string[]): Promise<void> {
  const orderNbrFlag = flagValue(args, "--order-nbr");
  const customerOrderFlag = flagValue(args, "--customer-order");
  // Only use a positional argument as an order number when no explicit flag is passed.
  const positionalArg = orderNbrFlag || customerOrderFlag ? undefined : args.find((a) => !a.startsWith("-"));
  const orderNbr = orderNbrFlag || positionalArg;
  const customerOrder = customerOrderFlag;
  let filter: string;
  if (orderNbr) filter = `OrderNbr eq '${orderNbr}'`;
  else if (customerOrder) filter = `CustomerOrder eq '${customerOrder}'`;
  else {
    fail(
      "lookup-order needs an id.",
      "Pass an Acumatica order number (lookup-order SO574027) or a retailer order (--customer-order 840432706992).",
    );
  }
  say(`Searching sales orders where ${filter}.`);
  const result = await apiRequest(`SalesOrder?$filter=${encodeURIComponent(filter)}&$top=5`, "GET");
  const rows = Array.isArray(result.data) ? result.data : [];
  console.log(JSON.stringify({
    success: result.success,
    found: rows.length,
    orders: rows.map((r: any) => ({
      OrderNbr: r.OrderNbr?.value,
      CustomerOrder: r.CustomerOrder?.value,
      CustomerID: r.CustomerID?.value,
      Status: r.Status?.value,
      Date: r.Date?.value,
      Description: r.Description?.value,
    })),
    error: result.error,
  }, null, 2));
  process.exit(result.success ? 0 : 1);
}

async function cmdLookupWarranty(args: string[]): Promise<void> {
  const serial = flagValue(args, "--serial") || args.find((a) => !a.startsWith("-"));
  if (!serial) {
    fail("lookup-warranty needs a serial number.", "Example: npm run acumatica -- lookup-warranty 0012412033380609022");
  }
  say(`Searching warranty cases with serial ${serial} in the subject.`);
  const result = await apiRequest(`Case?$filter=${encodeURIComponent(`substringof('${serial}',Subject)`)}&$top=5`, "GET");
  const rows = Array.isArray(result.data) ? result.data : [];
  console.log(JSON.stringify({
    success: result.success,
    found: rows.length,
    cases: rows.map((r: any) => ({
      CaseID: r.CaseID?.value,
      Subject: r.Subject?.value,
      Status: r.Status?.value,
      Severity: r.Severity?.value,
      ClassID: r.ClassID?.value,
    })),
    error: result.error,
  }, null, 2));
  if (result.success && rows.length === 0) {
    say("No case found for that serial. If this is a registration, draft the customer email from fixtures/warranty-email/.");
  }
  process.exit(result.success ? 0 : 1);
}

function cmdUrl(args: string[]): void {
  const [screen, id] = args.filter((a) => !a.startsWith("-"));
  if (!screen) {
    fail(
      "url needs a screen name.",
      `Known screens: ${Object.keys(SCREENS).join(", ")}. Example: npm run acumatica -- url sales-order SO574027`,
    );
  }
  const info = screenUrl(screen, id);
  console.log(JSON.stringify(info, null, 2));
  say(`Open this in the browser to show the ${info.label}${id ? ` for ${id}` : ""}.`);
}

// ─── CLI Router & Help ───────────────────────────────────────────────

const COMMAND_HELP: Record<string, string> = {
  login: `login — authenticate with a cookie session (no Connected App needed)

  npm run acumatica -- login

Stores session cookies at ~/.acumatica-cookies.txt (valid about one hour).`,
  status: `status — test the Acumatica connection

  npm run acumatica -- status

Reads one Customer record and reports which auth method worked (oauth or cookie).`,
  config: `config — interactive credential setup

  npm run acumatica -- config

Writes ${CONFIG_PATH}. Set ACUMATICA_CONFIG to use a different path.`,
  "show-config": `show-config — print the current config with the password masked`,
  "setup-app": `setup-app — print the one-time Connected Application setup steps for OAuth`,
  "push-order": `push-order — create a Sales Order from JSON

  npm run acumatica -- push-order --file artifacts/order.json
  cat artifacts/acumatica-payload.json | jq -c '.order' | npm run acumatica -- push-order

Input: an order object (see scripts/acumatica/SKILL.md for the shape).
On success, stderr prints the new OrderNbr plus the url and verify commands to show it.`,
  "push-warranty": `push-warranty — create a warranty Case from JSON

  npm run acumatica -- push-warranty --file artifacts/warranty.json
  cat artifacts/acumatica-payload.json | jq -c '.warranty' | npm run acumatica -- push-warranty`,
  "push-both": `push-both — create the Sales Order and the warranty Case in one run

  npm run acumatica -- push-both --file artifacts/acumatica-payload.json

Input: {"order": {...}, "warranty": {...}}. Output JSON contains both results.`,
  "lookup-order": `lookup-order — find existing sales orders (use before pushing to avoid duplicates)

  npm run acumatica -- lookup-order SO574027
  npm run acumatica -- lookup-order --customer-order 840432706992`,
  "lookup-warranty": `lookup-warranty — find warranty cases by serial number

  npm run acumatica -- lookup-warranty 0012412033380609022`,
  url: `url — print the deep link for an Acumatica screen (for browser demos and verification)

  npm run acumatica -- url sales-order SO574027   (Sales Orders, SO301000)
  npm run acumatica -- url invoice INV001234      (Sales Order Invoices, SO303000)
  npm run acumatica -- url case CS017612          (Cases, CR306000)`,
};

function showHelp(command?: string): void {
  if (command && COMMAND_HELP[command]) {
    console.log(COMMAND_HELP[command]);
    return;
  }
  console.log(`Power Smart Acumatica CLI — ps-acumatica
Acumatica Contract-Based REST API (cookie session, OAuth ROPC when available)

USAGE
  npm run acumatica -- <command> [options]
  npm run acumatica -- help <command>

SETUP
  config           Interactive credential setup (writes ${CONFIG_PATH})
  login            Authenticate with a cookie session
  status           Test the connection and report the auth method
  show-config      Print the config with the password masked
  setup-app        Print the Connected Application setup steps for OAuth

PUSH (payload: --file <path>, a bare path, or JSON on stdin)
  push-order       Create a Sales Order
  push-warranty    Create a warranty Case
  push-both        Create both from one {order, warranty} payload

LOOKUP AND SHOW
  lookup-order     Find sales orders by OrderNbr or --customer-order
  lookup-warranty  Find warranty cases by serial number
  url              Print the browser deep link for sales-order, invoice, or case

OPTIONS
  --file <path>    Read the payload from a file instead of stdin
  --quiet          Suppress progress narration on stderr (stdout is always pure JSON)

TYPICAL RUN
  npm run acumatica -- login
  npm run acumatica -- lookup-order --customer-order 840432706992
  npm run acumatica -- push-order --file artifacts/order.json
  npm run acumatica -- url sales-order SO574027`);
}

function suggestCommand(cmd: string): string | undefined {
  const all = [...Object.keys(COMMAND_HELP), "help"];
  return all.find((c) => c.startsWith(cmd) || c.includes(cmd) || cmd.includes(c));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((a) => {
    if (a === "--quiet") { QUIET = true; return false; }
    return true;
  });
  const [cmd, ...args] = argv;

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    showHelp(args[0]);
    return;
  }

  switch (cmd) {
    case "login": return await cmdLogin();
    case "setup-app": return cmdSetupConnectedApp();
    case "config": return cmdConfig();
    case "show-config": return cmdShowConfig();
    case "status": return await cmdStatus();
    case "push-order": return await cmdPushOrder(args);
    case "push-warranty": return await cmdPushWarranty(args);
    case "push-both": return await cmdPushBoth(args);
    case "lookup-order": return await cmdLookupOrder(args);
    case "lookup-warranty": return await cmdLookupWarranty(args);
    case "url": return cmdUrl(args);
    default: {
      const suggestion = suggestCommand(cmd);
      fail(
        `Unknown command: ${cmd}`,
        suggestion
          ? `Did you mean "${suggestion}"? Run: npm run acumatica -- help`
          : "Run: npm run acumatica -- help",
      );
    }
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }, null, 2));
  process.exit(1);
});
