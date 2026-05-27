#!/usr/bin/env node
/**
 * Power Smart Acumatica CLI — `ps-acumatica`
 *
 * Built against Acumatica Contract-Based REST API (v22.200.001+).
 * Auth: OAuth ROPC (preferred) with cookie-based session fallback.
 *
 * Printing-Press CLI Patterns: agent-first JSON, curated commands, pipeable.
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
}

// ─── Config ──────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(process.env.HOME || "/root", ".acumatica-config.json");
const COOKIE_JAR_PATH = path.join(process.env.HOME || "/root", ".acumatica-cookies.txt");

function loadConfig(): AcumaticaConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(JSON.stringify({ error: `Config not found at ${CONFIG_PATH}` }));
    console.error("Run: ps-acumatica config");
    process.exit(1);
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
      console.error(JSON.stringify({ warning: "Session cookies may be expired (>1hr). Run: ps-acumatica login" }));
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
      return { success: false, error: `OAuth failed (${oauthErr.message}) and no session cookies found. Run: ps-acumatica login` };
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
    return { success: true, statusCode: response.status, data: parsed, auth: authMethod } as any;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function apiPut(endpoint: string, body: Record<string, unknown>): Promise<ApiResponse> {
  return apiRequest(endpoint, "PUT", body);
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

// ─── Commands ────────────────────────────────────────────────────────

async function cmdStatus(): Promise<void> {
  try {
    const config = loadConfig();
    const result = await apiRequest("Customer?\$top=1", "GET");
    if (result.success) {
      const data = Array.isArray(result.data) ? result.data : [];
      const authMethod = (result as any).auth || "unknown";
      console.log(JSON.stringify({
        status: "connected",
        tenant: config.tenant,
        auth: authMethod,
        entityTest: data.length > 0 ? "OK" : "unexpected",
        sampleCustomer: data[0]?.CustomerName?.value || "N/A",
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
    const cookieStr = await cookieLogin(config);
    console.log(JSON.stringify({ status: "logged_in", tenant: config.tenant, cookieJar: COOKIE_JAR_PATH }, null, 2));
    // Verify session works by testing entity access
    const result = await apiRequest("Customer?\$top=1", "GET");
    if (result.success) {
      console.log(JSON.stringify({ verify: "Session valid, entity access confirmed" }, null, 2));
    }
  } catch (err: any) {
    console.log(JSON.stringify({ status: "login_failed", error: err.message }, null, 2));
    process.exit(1);
  }
}

function cmdSetupConnectedApp(): void {
  const config = loadConfig();
  console.log(`╔══════════════════════════════════════════════════════════════╗
║  CONNECTED APPLICATION SETUP GUIDE                          ║
╠══════════════════════════════════════════════════════════════╣
║                                                            ║
║  Cookie-based auth IS working via:                          ║
║    POST /entity/auth/login → session cookies                ║
║                                                            ║
║  But OAuth ROPC requires a Connected Application.           ║
║  To create one:                                            ║
║                                                            ║
║  1. Log into the Acumatica sandbox at:                      ║
║     ${config.baseUrl}/                                     ║
║                                                            ║
║  2. Navigate to: Connected Applications (SM303010)          ║
║                                                            ║
║  3. Click "+" to add a new Connected Application           ║
║                                                            ║
║  4. Fill in:                                               ║
║     - Client Name: ps-acumatica-cli                         ║
║     - Client ID: api                                       ║
║     - Flow: Resource Owner Password Credentials             ║
║     - Scopes: api, offline_access                          ║
║     - Click SAVE                                           ║
║                                                            ║
║  5. After creation, the Client Secret will be shown ONCE.   ║
║     Save it! Then run: ps-acumatica login                   ║
║                                                        ║
╚══════════════════════════════════════════════════════════════╝`);
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

// ─── Stdin ───────────────────────────────────────────────────────────

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    const { stdin } = process; stdin.setEncoding("utf-8");
    stdin.on("readable", () => { let chunk; while ((chunk = stdin.read()) !== null) data += chunk; });
    stdin.on("end", () => resolve(data.trim()));
    if (stdin.isTTY) resolve("");
  });
}

// ─── CLI Router & Help ───────────────────────────────────────────────

function showHelp(): void {
  console.log(`Power Smart Acumatica CLI — ps-acumatica
Built on Acumatica Contract-Based REST API (OAuth ROPC + cookie session)

USAGE: npx tsx scripts/acumatica/cli.ts <command>

COMMANDS:
  login           Authenticate via cookie-based session (works without Connected App)
  setup-app       Show Connected Application setup guide
  config          Interactive config setup
  show-config     Display config (password masked)
  status          Test Acumatica connection (OAuth → cookie fallback)
  push-order      Push sales order (JSON via stdin)
  push-warranty   Push warranty case (JSON via stdin)
  push-both       Push order + warranty together (JSON via stdin)

EXAMPLE:
  # First login (cookie-based, no Connected App needed)
  npx tsx scripts/acumatica/cli.ts login

  # Test connection
  npx tsx scripts/acumatica/cli.ts status

  # Push data
  cat artifacts/acumatica-payload.json | npx tsx scripts/acumatica/cli.ts push-both`);
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  switch (cmd) {
    case "login": return await cmdLogin();
    case "setup-app": return cmdSetupConnectedApp();
    case "config": return cmdConfig();
    case "show-config": return cmdShowConfig();
    case "status": return await cmdStatus();
    case "push-order": {
      const data = await readStdin();
      if (!data) { console.error(JSON.stringify({ error: "Pipe JSON to stdin" })); process.exit(1); }
      const order = JSON.parse(data);
      const cust = resolveCustomerId(order);
      console.error(JSON.stringify({ customer: cust }));
      const result = await pushSalesOrder(order, cust.id);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    }
    case "push-warranty": {
      const data = await readStdin();
      if (!data) { console.error(JSON.stringify({ error: "Pipe JSON to stdin" })); process.exit(1); }
      const result = await pushWarrantyCase(JSON.parse(data));
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    }
    case "push-both": {
      const data = await readStdin();
      if (!data) { console.error(JSON.stringify({ error: "Pipe {order, warranty} JSON to stdin" })); process.exit(1); }
      const payload: { order: SalesOrderInput; warranty: WarrantyCaseInput } = JSON.parse(data);
      const cust = resolveCustomerId(payload.order);
      console.error(JSON.stringify({ customer: cust }));
      console.log("=== PUSHING ORDER ===");
      const orderResult = await pushSalesOrder(payload.order, cust.id);
      console.log(JSON.stringify(orderResult, null, 2));
      console.log("\n=== PUSHING WARRANTY ===");
      const warrantyResult = await pushWarrantyCase(payload.warranty);
      console.log(JSON.stringify(warrantyResult, null, 2));
      process.exit(orderResult.success && warrantyResult.success ? 0 : 1);
    }
    default: showHelp(); process.exit(0);
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }, null, 2));
  process.exit(1);
});
