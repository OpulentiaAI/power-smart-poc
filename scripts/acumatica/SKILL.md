# Power Smart Acumatica CLI reference

Reference for `ps-acumatica`, the CLI at `scripts/acumatica/cli.ts`. It talks to the Acumatica Contract-Based REST API (v22.200.001). The workflow playbooks that use this CLI live in `.agents/skills/`.

The output contract: results are JSON on stdout, so every command pipes cleanly. Progress and next-step hints are plain sentences on stderr, written so an agent can quote them while narrating a run. Pass `--quiet` to silence the narration. Exit code 0 means success and 1 means any error.

## Quick start

```bash
npm run acumatica -- config          # one time, writes ~/.acumatica-config.json
npm run acumatica -- login           # cookie session, no Connected App needed
npm run acumatica -- status          # proves the connection and names the auth method
npm run acumatica -- push-order --file artifacts/order.json
npm run acumatica -- url sales-order SO574027
```

`npm run acumatica -- help` prints the full command list, and `help <command>` prints the detail for one command.

## Commands

| Command | What it does |
|---|---|
| `config` | Interactive credential setup. Writes the config file. |
| `login` | Authenticates with a cookie session and verifies entity access. |
| `status` | Reads one Customer record and reports which auth method worked. |
| `show-config` | Prints the config with the password masked. |
| `setup-app` | Prints the one time Connected Application steps for OAuth. |
| `push-order` | Creates a Sales Order from an order JSON payload. |
| `push-warranty` | Creates a warranty Case from a warranty JSON payload. |
| `push-both` | Creates both from one `{order, warranty}` payload. |
| `lookup-order` | Finds sales orders by `OrderNbr` or by `--customer-order`. Use before pushing to avoid duplicates. |
| `lookup-warranty` | Finds warranty cases whose subject contains a serial number. |
| `url` | Prints the deep link for an Acumatica screen, for browser demos and verification. |

## Payload input

The push commands accept the payload three ways, checked in this order:

1. `--file <path>`
2. a bare path argument, e.g. `push-both artifacts/acumatica-payload.json`
3. JSON piped to stdin

When no payload arrives, the error JSON names all three options.

## Screen deep links

`url` prints a JSON object with the screen id and the full URL:

| Screen argument | Acumatica screen | Example |
|---|---|---|
| `sales-order` | Sales Orders, SO301000 | `url sales-order SO574027` |
| `invoice` | Sales Order Invoices, SO303000 | `url invoice INV001234` |
| `case` | Cases, CR306000 | `url case CS017612` |

An agent showing a milestone opens this URL in the browser and screenshots the record. The headless fallback is `npm run verify-acumatica-ui -- <OrderNbr> <CaseID> <CustomerOrder> <Serial>`, which saves screenshots under `artifacts/ui-verification/`.

## Auth

Two paths, tried in this order by every API call:

1. **OAuth ROPC.** POST to `/identity/connect/token`. Requires a Connected Application (client id `api`, ROPC flow, scopes `api offline_access`) created once at screen SM303010. `setup-app` prints the steps.
2. **Cookie session.** POST to `/entity/auth/login` with the company name. Works with no Connected App, which is why `login` is the POC default. Cookies live at `~/.acumatica-cookies.txt` and last about one hour; the CLI warns on stderr when they look stale.

`status` reports which path worked in its `auth` field.

## Configuration

The config lives at `~/.acumatica-config.json`. Set the `ACUMATICA_CONFIG` environment variable to point at a different file, e.g. for a second tenant or for tests.

```json
{
  "baseUrl": "https://amerisuninc.acumatica.com",
  "tenant": "Test",
  "username": "Agent",
  "password": "***",
  "company": "AmeriSun Inc. - Test"
}
```

The `company` field must match the company name in Acumatica, because cookie login sends it.

## Payload shapes

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

`customerId` is optional. When omitted, the CLI resolves the retailer itself and prints its reasoning on stderr:

| Match | CustomerID |
|---|---|
| Home Depot with a Canadian address | `C00006` |
| Home Depot with a US address | `C00008` |
| Amazon | `C00002` |
| Walmart | `C00009` |
| Anything else | `C00001`, and a human should confirm first |

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

A `validationResult` of `"escalated"` maps to `Severity: High` on the created case.

## Output shapes

Success:

```json
{
  "success": true,
  "statusCode": 200,
  "data": { "OrderNbr": { "value": "SO574025" }, "Status": { "value": "Open" } },
  "customer": { "id": "C00006", "source": "home_depot_canada" }
}
```

Failure:

```json
{
  "success": false,
  "statusCode": 500,
  "error": "...Acumatica error detail..."
}
```

`lookup-order` and `lookup-warranty` return `{ success, found, orders | cases }` with the key fields already unwrapped.

## Known constraints

- `CustomerID` is a segment key, so arbitrary values fail. The POC maps known retailers to existing sandbox customers, and production payloads should pass an explicit `customerId`.
- Acumatica auto numbering needs `Date` populated on `<NEW>` orders. Dates are ISO 8601.
- The SOAP endpoint for creating Connected Applications returns empty responses, so the one time OAuth setup happens in the browser at SM303010.

## Verified run, May 24, 2026

Against the `amerisuninc.acumatica.com` Test tenant: login and status connected with cookie auth, sales order SO574027 created for customer C00006 with customer order 840432706992, and warranty case CS17612 created. Evidence is in `artifacts/poc-execution-validation.md`.

## Dependencies

Node.js 18 or newer for native `fetch`, `curl` for cookie capture during login, and `tsx` to run the TypeScript entry point. The SPS BOL CLI is separate; see `scripts/sps-commerce/SKILL.md`.
