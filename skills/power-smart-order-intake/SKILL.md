---
name: power-smart-order-intake
description: "End-to-end Power Smart sales order intake: extract structured customer/order text, validate retailer rules, push Sales Order to Acumatica Test sandbox, verify in SO301000. Use for order intake, Homedepot/Amazon orders, ps-acumatica push-order, or running npm run pipeline."
disable-model-invocation: true
---

# Power Smart — order intake

Phased playbook for turning structured intake text (web form, email body, pasted fields) into an Acumatica Sales Order on the **Test** tenant.

Repo: `power-smart-poc`. CLI: `npm run acumatica -- <command>`.

## Definition of done

All must pass:

1. `parseStructuredOrder` + `validateOrder` return success for the intake text.
2. `artifacts/acumatica-payload.json` contains an `order` object with `orderNumber`, `customerName`, `serialNumber`.
3. `npm run acumatica -- push-order` (or `push-both`) exits 0 and JSON shows `"success": true`.
4. UI verification: Sales Orders screen shows `CustomerOrder` matching the retailer order number (or recorded `OrderNbr` from API response).

## Phase 0 — credentials (once per machine)

If `~/.acumatica-config.json` is missing, obtain sandbox settings (Outlook from Syed or user-provided):

| Field | Value |
|-------|-------|
| baseUrl | `https://amerisuninc.acumatica.com` |
| tenant | `Test` |
| company | `AmeriSun Inc. - Test` |
| username | `Agent` |
| password | (from secure channel) |

```bash
cat > ~/.acumatica-config.json << 'EOF'
{
  "baseUrl": "https://amerisuninc.acumatica.com",
  "tenant": "Test",
  "username": "Agent",
  "password": "<SECRET>",
  "company": "AmeriSun Inc. - Test"
}
EOF
chmod 600 ~/.acumatica-config.json
npm run acumatica -- login
npm run acumatica -- status
```

| Check | Pass when |
|-------|-----------|
| Config exists | `npm run acumatica -- show-config` prints masked JSON |
| Session | `status` returns `"status": "connected"` |

## Phase 1 — extract

Source: pasted text, `fixtures/sample-order-intake.txt`, or email body.

```bash
cd power-smart-poc
npm run pipeline   # runs extract + validate + writes payload; push if configured
```

Or inspect extraction only via `lib/power-smart/extraction.ts` (used by pipeline).

| Check | Pass when |
|-------|-----------|
| Extraction | `customerName`, `orderNumber`, `platform`, `serialNumber` populated |
| Retailer | `validateOrder` → `retailerRecognized: true` for known platforms |

## Phase 2 — validate

Validation rules live in `lib/power-smart/extraction.ts` (`validateOrder`).

| Check | Pass when |
|-------|-----------|
| Email | `emailValid: true` |
| Serial | 19-digit pattern for Power Smart units |
| Overall | `validation.valid === true` |

On failure: log row in `decisions.tsv` (show-me-your-work), escalate — do not push.

## Phase 3 — push Sales Order

```bash
cat artifacts/acumatica-payload.json | jq -c '.order' | npm run acumatica -- push-order
```

Customer resolution is automatic (`C00006` Home Depot Canada, `C00008` US, etc.) — see stderr `customer` line.

| Check | Pass when |
|-------|-----------|
| API | stdout JSON `"success": true` |
| Order number | `data.OrderNbr.value` or equivalent present |

Record `OrderNbr` and `CustomerOrder` in `decisions.tsv` evidence column.

## Phase 4 — UI verify

```bash
npm run verify-acumatica-ui -- <OrderNbr> <CaseId-if-any> <CustomerOrder> <Serial>
```

Open `artifacts/ui-verification/ui-verification.json` and screenshots `02-sales-orders.png`.

| Check | Pass when |
|-------|-----------|
| Session | `session` check pass |
| Customer order | body contains retailer order number (e.g. `840432706992`) |

## Exception loop

| Symptom | Action |
|---------|--------|
| `require is not defined` on login | Ensure `scripts/acumatica/cli.ts` uses ESM `import { execSync }` |
| OAuth failed, no cookies | `npm run acumatica -- login` then retry |
| Unknown retailer | Push with default customer `C00001` only after human confirms |
| Duplicate order | Search SO301000 before push; skip if `CustomerOrder` exists |

## Artifacts

| Path | Purpose |
|------|---------|
| `artifacts/acumatica-payload.json` | Combined order + warranty payload |
| `artifacts/pipeline-results.json` | Phase timings from `npm run pipeline` |
| `artifacts/ui-verification/` | Playwright screenshots + JSON |
