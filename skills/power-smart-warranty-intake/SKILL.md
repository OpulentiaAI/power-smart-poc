---
name: power-smart-warranty-intake
description: "Power Smart warranty registration: parse claimant fields from email templates (snow blower / lawn mower), validate serial and proof-of-purchase rules, push Acumatica Case (RQ), verify in CR306000. Use for warranty intake, Latrice templates, push-warranty, or push-both."
disable-model-invocation: true
---

# Power Smart — warranty intake

Phased playbook for warranty registrations that arrive by phone/email. AmeriSun sends customers a template (snow blower or lawn mower) asking for purchaser name, address, phone, model, 19-digit serial, and proof of purchase.

Repo: `power-smart-poc`. CLI: `npm run acumatica -- push-warranty` or `push-both`.

## Definition of done

1. Warranty payload includes `claimantName`, `serialNumber`, `validationResult` (`validated` or `escalated`).
2. `push-warranty` exits 0 with `"success": true`.
3. Case screen (CR306000) shows subject containing serial `001…` or case ID from API.
4. `decisions.tsv` row links push JSON to screenshot path.

## Phase 0 — credentials

Same as order intake (`~/.acumatica-config.json`, Test tenant). Run `login` + `status` before any push.

## Phase 1 — intake sources

| Source | Notes |
|--------|-------|
| Structured form text | Same parser as orders (`parseStructuredOrder`) |
| Email thread | Extract fields matching Latrice templates (snow blower / lawn mower) |
| `fixtures/sample-order-intake.txt` | Golden sample: Jason Mack, serial `0012412033380609022` |

Required fields for warranty body:

- Name of Purchaser, Shipping Address, Phone, Model Number, Serial Number (19-digit; lawn mower often starts with `001`)
- Proof of purchase (receipt image or order details with date, amount, SKU)

## Phase 2 — validate

Build warranty object (pipeline does this automatically):

```json
{
  "claimantName": "...",
  "phone": "...",
  "email": "...",
  "address": "...",
  "productCategory": "...",
  "modelSku": "...",
  "serialNumber": "...",
  "platform": "...",
  "orderNumber": "...",
  "purchaseDate": "...",
  "validationResult": "validated",
  "validationNotes": "All checks passed"
}
```

| Check | Pass when |
|-------|-----------|
| Serial | 19 numeric digits; ignore engine stickers per AmeriSun guidance |
| Escalation | Missing proof → `validationResult: "escalated"`, `Severity: High` in API |

## Phase 3 — push Case

```bash
cat artifacts/acumatica-payload.json | jq -c '.warranty' | npm run acumatica -- push-warranty
```

Or combined with order:

```bash
cat artifacts/acumatica-payload.json | npm run acumatica -- push-both
```

Acumatica mapping: `Case` entity, `CaseClass: RQ`, subject `Warranty Claim — {name} — {serial}`.

| Check | Pass when |
|-------|-----------|
| API | `"success": true` |
| Case ID | `data.CaseID.value` or `CaseCD` captured in evidence |

## Phase 4 — UI verify

```bash
npm run verify-acumatica-ui -- <OrderNbr-optional> <CaseID> <orderNumber> <serial>
```

Inspect `artifacts/ui-verification/03-warranty-cases.png` and JSON `warranty serial` check.

## Template reference (from operations email)

Snow blower and lawn mower templates differ only in serial location instructions; both require proof of purchase. Do not invent fields — map exactly what the customer returned.

## Exception loop

| Symptom | Action |
|---------|--------|
| Invalid serial | Reject push; ask customer to rescan deck/flap barcode |
| Duplicate case | Search CR306000 by serial before push |
| push-both partial failure | Read order vs warranty JSON separately; retry failed half only |

## Artifacts

| Path | Purpose |
|------|---------|
| `artifacts/acumatica-payload.json` | `.warranty` object |
| `artifacts/ui-verification/` | Case screen proof |
