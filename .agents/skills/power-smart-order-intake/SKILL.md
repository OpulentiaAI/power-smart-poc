---
name: power-smart-order-intake
description: "Order intake for Power Smart: turn structured customer order text into an Acumatica sales order on the Test tenant, then prove it on screen SO301000. Use for retail order intake from Home Depot, Amazon, or Walmart, for push-order, or for npm run pipeline."
---

# Power Smart order intake

Turn structured intake text, such as a web form or an email body, into a sales order on the Acumatica Test tenant.

Repo: `power-smart-poc`. CLI: `npm run acumatica -- <command>`. Run `npm run acumatica -- help` for the command list.

Follow [show every step](../power-smart-show-your-work/SKILL.md) for the whole run. All actions use `browser_manage`, `computer_manage`, or visible `run_command` calls.

## Done when

1. `parseStructuredOrder` and `validateOrder` both pass for the intake text.
2. `push-order` exits 0 and its JSON shows `"success": true` with an `OrderNbr`.
3. The source intake, extracted payload, validation, and duplicate lookup are visible in the transcript.
4. The Sales Orders screen (SO301000) shows the retailer order number, and the screenshot is in the transcript with an annotation.
5. The transcript document has one entry per phase below.

## Phase 0. Credentials, once per machine

Skip this phase when `npm run acumatica -- status` reports `"status": "connected"`.

Obtain the sandbox settings from the user or from Syed's Outlook thread. When they come from Outlook, open and capture the selected message with `browser_manage` before configuring the CLI. Never show the password in the transcript or command output.

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

## Phase 1. Show and capture the intake

Tell the user which source you are reading. Sources are pasted text, an email body, or the golden sample at `fixtures/sample-order-intake.txt`.

- Email or web form: open it with `browser_manage`, capture the body and attachment names, then save only the selected intake to `artifacts/<run-id>/intake.txt`.
- Local fixture: show a bounded preview with `run_command`.
- Never scrape the whole inbox or expose unrelated messages.

Record `email/form/fixture → artifacts/<run-id>/intake.txt` before extraction.

## Phase 2. Extract

Run the extraction CLI with `run_command`. For the golden POC:

```bash
npm run pipeline -- --input artifacts/<run-id>/intake.txt --prepare-only
```

The pipeline extracts the fields, validates them, and writes `artifacts/acumatica-payload.json`. The extraction logic lives in `lib/power-smart/extraction.ts`.

Pretty-print the `.order` object with `jq`, show it to the client, and record `intake text → artifacts/acumatica-payload.json.order` with the extracted name, order number, and serial as evidence. `--prepare-only` is mandatory here so no Acumatica side effect occurs before the duplicate check.

This phase is done when `customerName`, `orderNumber`, `platform`, and `serialNumber` are all populated.

## Phase 3. Validate

`validateOrder` in `lib/power-smart/extraction.ts` checks the retailer, the email format, and the 19 digit serial pattern.

Show the validation checks from `artifacts/pipeline-results.json` with `run_command`. This phase is done when `validation.valid` is true. On failure, record a fail entry in the transcript with the failing checks, tell the user what is missing, and stop. Escalate to a human instead of pushing.

## Phase 4. Check for duplicates

Search before you create, so a retry never makes a second order:

```bash
npm run acumatica -- lookup-order --customer-order <retailer order number>
```

Record the lookup command and its bounded JSON result. This phase is done when the lookup returns `"found": 0`. When it finds an existing order, show that order in the browser and stop.

## Phase 5. Push the sales order

Narrate what you are about to push and why it is safe, then use one visible `run_command` call:

```bash
npm run acumatica -- push-order --file artifacts/order.json
```

The order object is the `.order` field of `artifacts/acumatica-payload.json`, so you can also pipe it: `cat artifacts/acumatica-payload.json | jq -c '.order' | npm run acumatica -- push-order`.

The CLI resolves the customer id itself and explains its choice on stderr, e.g. `Resolved customer C00006 (home_depot_canada)`. Repeat that reason to the user. When the retailer is unrecognized the CLI falls back to `C00001`; confirm with a human before accepting that fallback.

Record a transcript entry with the transfer line "artifacts/acumatica-payload.json order to Acumatica SalesOrder API" and the returned `OrderNbr` as evidence.

This phase is done when stdout JSON shows `"success": true` and you have captured the `OrderNbr`.

## Phase 6. Show the milestone

The sales order now exists, so show it:

```bash
npm run acumatica -- url sales-order <OrderNbr>
```

Open the printed URL with `browser_manage(action="navigate")`, read the page, screenshot the record, insert the image into the transcript, and annotate what the viewer should see, such as the Customer Order field holding the retailer number. When the order has an invoice, repeat with `url invoice <RefNbr>`.

Do not use `verify-acumatica-ui` as the normal client workflow; it is headless and does not satisfy the visual execution contract. This phase is done when the fresh browser screenshot proves the record.

## Exceptions

| Symptom | Action |
|---|---|
| OAuth fails and no cookies exist | `npm run acumatica -- login`, then retry the command. |
| Session older than one hour | The CLI warns on stderr. Run `login` again. |
| Unknown retailer | Confirm with a human before pushing with the default customer `C00001`. |
| Duplicate order found in Phase 4 | Show the existing order and stop. |

## Artifacts

| Path | Purpose |
|---|---|
| `artifacts/acumatica-payload.json` | Combined order and warranty payload. |
| `artifacts/pipeline-results.json` | Phase results from `npm run pipeline`. |
