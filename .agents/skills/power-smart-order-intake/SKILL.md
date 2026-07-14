---
name: power-smart-order-intake
description: "Order intake for Power Smart: turn structured customer order text into an Acumatica sales order on the Test tenant, then prove it on screen SO301000. Use for retail order intake from Home Depot, Amazon, or Walmart, for push-order, or for npm run pipeline."
---

# Power Smart order intake

Turn structured intake text, such as a web form or an email body, into a sales order on the Acumatica Test tenant.

Repo: `power-smart-poc`. CLI: `npm run acumatica -- <command>`. Run `npm run acumatica -- help` for the command list.

Follow [show your work](../power-smart-show-your-work/SKILL.md) for the whole run: narrate each phase before you start it, record it in the transcript document, and show each milestone in the browser.

## Done when

1. `parseStructuredOrder` and `validateOrder` both pass for the intake text.
2. `push-order` exits 0 and its JSON shows `"success": true` with an `OrderNbr`.
3. The Sales Orders screen (SO301000) shows the retailer order number, and the screenshot is in the transcript with an annotation.
4. The transcript document has one entry per phase below.

## Phase 0. Credentials, once per machine

Skip this phase when `npm run acumatica -- status` reports `"status": "connected"`.

Obtain the sandbox settings from the user or from Syed's Outlook thread, then write the config:

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

This phase is done when `status` prints `"status": "connected"`.

## Phase 1. Extract

Tell the user which source you are reading. Sources are pasted text, an email body, or the golden sample at `fixtures/sample-order-intake.txt`.

```bash
npm run pipeline
```

The pipeline extracts the fields, validates them, and writes `artifacts/acumatica-payload.json`. The extraction logic lives in `lib/power-smart/extraction.ts`.

Record a transcript entry with the transfer line "intake text to artifacts/acumatica-payload.json" and the extracted name, order number, and serial as evidence.

This phase is done when `customerName`, `orderNumber`, `platform`, and `serialNumber` are all populated.

## Phase 2. Validate

`validateOrder` in `lib/power-smart/extraction.ts` checks the retailer, the email format, and the 19 digit serial pattern.

This phase is done when `validation.valid` is true. On failure, record a fail entry in the transcript with the failing checks, tell the user what is missing, and stop. Escalate to a human instead of pushing.

## Phase 3. Check for duplicates

Search before you create, so a retry never makes a second order:

```bash
npm run acumatica -- lookup-order --customer-order <retailer order number>
```

This phase is done when the lookup returns `"found": 0`. When it finds an existing order, show that order to the user with `url sales-order <OrderNbr>` and stop.

## Phase 4. Push the sales order

Narrate what you are about to push and why it is safe, then:

```bash
npm run acumatica -- push-order --file artifacts/order.json
```

The order object is the `.order` field of `artifacts/acumatica-payload.json`, so you can also pipe it: `cat artifacts/acumatica-payload.json | jq -c '.order' | npm run acumatica -- push-order`.

The CLI resolves the customer id itself and explains its choice on stderr, e.g. `Resolved customer C00006 (home_depot_canada)`. Repeat that reason to the user. When the retailer is unrecognized the CLI falls back to `C00001`; confirm with a human before accepting that fallback.

Record a transcript entry with the transfer line "artifacts/acumatica-payload.json order to Acumatica SalesOrder API" and the returned `OrderNbr` as evidence.

This phase is done when stdout JSON shows `"success": true` and you have captured the `OrderNbr`.

## Phase 5. Show the milestone

The sales order now exists, so show it:

```bash
npm run acumatica -- url sales-order <OrderNbr>
```

Open the printed URL in the browser, screenshot the record, insert the image into the transcript, and annotate what the viewer should see, such as the Customer Order field holding the retailer number. When the order has an invoice, repeat with `url invoice <RefNbr>`.

Without browser tools, fall back to `npm run verify-acumatica-ui -- <OrderNbr> "" <CustomerOrder> <Serial>` and insert the screenshots it saves under `artifacts/ui-verification/`.

This phase is done when the transcript shows the annotated screenshot and the checks in `artifacts/ui-verification/ui-verification.json` pass, when that fallback ran.

## Exceptions

| Symptom | Action |
|---|---|
| OAuth fails and no cookies exist | `npm run acumatica -- login`, then retry the command. |
| Session older than one hour | The CLI warns on stderr. Run `login` again. |
| Unknown retailer | Confirm with a human before pushing with the default customer `C00001`. |
| Duplicate order found in Phase 3 | Show the existing order and stop. |

## Artifacts

| Path | Purpose |
|---|---|
| `artifacts/acumatica-payload.json` | Combined order and warranty payload. |
| `artifacts/pipeline-results.json` | Phase results from `npm run pipeline`. |
| `artifacts/ui-verification/` | Fallback screenshots and check results. |
