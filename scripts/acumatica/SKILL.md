/**
 * Power Smart Acumatica CLI — SKILL.md
 *
 * Follows printing-press-library CLI skill pattern.
 * This is the agent-facing instruction set for ps-acumatica.
 *
 * Repo: https://github.com/Git-Godssoldier/power-smart-poc
 * CLI: `npx tsx scripts/acumatica/cli.ts`
 * Auth: Cookie-based session (primary) with OAuth ROPC fallback (requires Connected App)
 * Reference: https://help-2024r2.acumatica.com (Contract-Based REST API)
 *
 * VERIFIED: 2026-05-24 against amerisuninc.acumatica.com Test tenant
 * - Login: working via POST /entity/auth/login with company=AmeriSun Inc. - Test
 * - Status: connected, entity access confirmed (Customer API)
 * - Push Sales Order: SO574027 created (Customer C00006, Customer Order 840432706992)
 * - Push Warranty Case: CS17612 created (WARRANTY class)
 * - SPS/BOL CLI added for third SOW: `npm run sps-bol -- generate ...`
 */

# Power Smart POC CLI Skills

Agent-first CLI instructions for the Power Smart POC repo.

The repo now has two command surfaces:

| CLI | Purpose |
|---|---|
| `npm run acumatica -- <command>` | Push warranty and retail order intake into Acumatica. |
| `npm run sps-bol -- auth setup/status/config` | Set up SPS Commerce bearer-token access in the TypeScript Printing Press style. |
| `npm run sps-bol -- generate ...` | Run SPS Commerce export cleanup, validation, and BOL DOCX generation for the third SOW. |

## Quick Start

```bash
# One-time config (stores to ~/.acumatica-config.json)
npm run acumatica -- config

# Login via cookie-based session (NO Connected App required)
npm run acumatica -- login

# Test connection (OAuth fallback → cookie auth)
npm run acumatica -- status

# Pipe order JSON
cat order.json | npm run acumatica -- push-order

# Pipe warranty JSON
cat warranty.json | npm run acumatica -- push-warranty

# Push both together
cat combined.json | npm run acumatica -- push-both

# Run SPS export to BOL generation
npm run sps-bol -- generate \
  --source "/path/to/A order BOL template.xlsx" \
  --template "/path/to/A BOL template.docx" \
  --out "artifacts/sps-bol-run"
```

## Acumatica Commands

| Command | Description |
|---------|-------------|
| `login` | Authenticate via cookie-based session (works without Connected App) |
| `setup-app` | Show Connected Application setup guide for OAuth ROPC |
| `config` | Interactive config setup (baseUrl, tenant, username, password) |
| `show-config` | Display current config (password masked) |
| `status` | Test Acumatica connection (tries OAuth → falls back to cookie auth) |
| `push-order` | Create/update a Sales Order (JSON via stdin) |
| `push-warranty` | Create a Case for warranty (JSON via stdin) |
| `push-both` | Push order + warranty together (JSON via stdin) |

## SPS/BOL Commands

| Command | Description |
|---------|-------------|
| `generate` | Read SPS workbook `Sheet1` and destination/reference `Sheet2`, normalize rows, validate required BOL fields, generate one DOCX BOL per valid row, and write CSV/JSON QA artifacts. |
| `auth setup` | Print SPS Commerce Dev Center/Auth0 bearer-token setup instructions. |
| `config` | Store local SPS Commerce base URL and optional bearer token. |
| `status` | Validate bearer-token availability; optionally probe a supplied SPS endpoint. |

Required arguments:

| Argument | Description |
|---|---|
| `--source` | SPS/order workbook path. Expected tabs: `Sheet1`, `Sheet2`. |
| `--template` | Word BOL template with merge placeholders. |
| `--out` | Output directory for normalized CSVs, generated BOLs, previews, QA report, manifest, and summary. |

SPS/BOL output files:

| File | Purpose |
|---|---|
| `01_sps_export_raw.csv` | Raw SPS export rows from workbook `Sheet1`. |
| `02_destination_reference.csv` | Destination/reference rows from workbook `Sheet2`. |
| `03_normalized_orders.csv` | Canonical normalized order rows. |
| `04_bol_field_mapping.csv` | Template placeholder to payload field map. |
| `05_bol_payload.csv` | Valid BOL merge payload rows. |
| `06_validation_report.csv` | Required-field validation status. |
| `07_output_manifest.csv` | Generated DOCX and preview path manifest. |
| `08_docx_qa_report.csv` | Unreplaced-placeholder QA. |
| `automation_summary.json` | Machine-readable run summary. |

## Auth Architecture

Two auth paths, attempted in order by `apiRequest()`:

1. **OAuth ROPC** (preferred when available):
   - POST to `/identity/connect/token` with `grant_type=password`
   - Uses `Authorization: Bearer <token>` header
   - Requires a Connected Application registered in Acumatica (SM303010)
   - Client ID: `api`, Flow: Resource Owner Password Credentials

2. **Cookie-based Session** (fallback — works without Connected App):
   - POST to `/entity/auth/login` with `company=AmeriSun Inc. - Test`
   - Uses curl internally for reliable Set-Cookie capture
   - Parses Netscape cookie jar format → `name=value; ` format
   - Stores at `~/.acumatica-cookies.txt`
   - Session valid for ~1 hour; run `ps-acumatica login` to refresh

**Status output confirms which auth method was used:**
```json
{
  "status": "connected",
  "tenant": "Test",
  "auth": "cookie",
  "entityTest": "OK",
  "sampleCustomer": "Amazon Vendor Central"
}
```

## Prerequisites

### For Cookie Auth (zero-config, POC-ready):
- Acumatica sandbox credentials in `~/.acumatica-config.json`
- Company name matching the Acumatica tenant (e.g., "AmeriSun Inc. - Test")

### For OAuth ROPC (production):
- Connected Application created at SM303010 with client_id=`api`, ROPC flow, scopes=`api offline_access`
- Run `ps-acumatica setup-app` for a step-by-step setup guide

## Configuration

Config stored at `~/.acumatica-config.json`:

```json
{
  "baseUrl": "https://amerisuninc.acumatica.com",
  "tenant": "Test",
  "username": "Agent",
  "password": "***",
  "company": "AmeriSun Inc. - Test"
}
```

The `company` field is used for cookie-based auth (must match the company name in Acumatica).

## STDIN Formats

### push-order
```json
{
  "customerName": "Jason Mack",
  "phone": "+19053755421",
  "email": "jaysonmon@live.ca",
  "address": "143A Balls Lane Cobourg ON K9A2L4",
  "platform": "Homedepot",
  "orderNumber": "840432706992",
  "orderedDate": "2026-05-11",
  "productCategory": "Gas Lawn Mower",
  "modelSku": "DB8721P",
  "serialNumber": "0012412033380609022",
  "customerId": "C00006"
}
```

`customerId` is optional. If omitted, the CLI resolves known retail platforms conservatively:

| Match | CustomerID |
|---|---|
| Home Depot Canada address | `C00006` |
| Home Depot US address | `C00008` |
| Amazon | `C00002` |
| Walmart | `C00009` |
| Fallback | `C00001` |

### push-warranty
```json
{
  "claimantName": "Jason Mack",
  "phone": "+19053755421",
  "email": "jaysonmon@live.ca",
  "address": "143A Balls Lane Cobourg ON K9A2L4",
  "productCategory": "Gas Lawn Mower",
  "modelSku": "DB8721P",
  "serialNumber": "0012412033380609022",
  "platform": "Homedepot",
  "orderNumber": "840432706992",
  "purchaseDate": "2026-05-11",
  "validationResult": "validated",
  "validationNotes": "Retailer recognized. All field checks passed. Receipt confirmed."
}
```

## Known Constraints

### Sales Order CustomerID
- Acumatica `CustomerID` is a segment key and cannot use arbitrary email addresses.
- POC uses existing sandbox customer IDs for known retailers.
- Prefer explicit `customerId` in production payloads when the retailer/customer mapping is known.

### Date Format
- Must use ISO 8601: `2026-05-11T00:00:00.000`
- The CLI's `wrap()` function formats dates correctly
- Acumatica auto-numbering requires `Date` to have a value for `<NEW>` orders

### Connected Application
- OAuth ROPC requires manual Connected Application creation at SM303010
- The SOAP endpoint for SM303010 exists but returns empty responses for programmatic creation
- Use the browser-based SM303010 screen for one-time setup
- Once created, the client secret appears once — save it securely

## API Endpoints

- `PUT /entity/Default/22.200.001/SalesOrder` — creates/updates sales orders
- `PUT /entity/Default/22.200.001/Case` — creates/updates warranty cases
- `GET /entity/Default/22.200.001/Customer?$top=1` — connection test
- `POST /entity/auth/login` — cookie-based session auth

All values are wrapped as `{"value": "..."}` per Acumatica contract-based format.

### BOL Rendering
- SPS/BOL CLI performs structural DOCX and placeholder QA.
- Visual PDF render QA requires LibreOffice/soffice; if absent, rely on preview text and `08_docx_qa_report.csv`.

## Verified Pipeline Run (2026-05-24)

Against amerisuninc.acumatica.com (Test tenant, AmeriSun Inc. - Test company):

| Step | Result |
|------|--------|
| Login (`ps-acumatica login`) | ✅ Session valid, entity access confirmed |
| Status (`ps-acumatica status`) | ✅ `connected`, `auth: cookie`, `entityTest: OK` |
| Sales Order push | ✅ SO574027 created (Status: Open, Customer: C00006, Customer Order: 840432706992) |
| Warranty Case push | ✅ CS17612 created (Class: WARRANTY, Status: New) |
| Extraction (Jason Mack) | ✅ 10/10 fields, 0 errors, 0 warnings |
| SPS/BOL generation | ✅ 4 valid payload rows, 4 DOCX BOLs generated, 0 unreplaced placeholders |

Evidence is recorded in `artifacts/poc-execution-validation.md`.

## Exit Codes

- `0` — success
- `1` — error (auth failed, invalid input, API error)

## Output

All output is JSON to stdout. Errors are JSON to stderr.

```json
{
  "success": true,
  "statusCode": 200,
  "data": { "OrderNbr": { "value": "SO574025" }, "Status": { "value": "Open" } }
}
```

```json
{
  "success": false,
  "statusCode": 500,
  "error": "...Acumatica error detail..."
}
```

## Dependencies

- Node.js 18+ (uses native `fetch`)
- `curl` (for reliable cookie capture during login)
- `tsx`, `xlsx`, and `jszip` for the SPS/BOL CLI
- Config file at `~/.acumatica-config.json`
- Cookie jar at `~/.acumatica-cookies.txt`
