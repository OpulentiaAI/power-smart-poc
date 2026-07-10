---
name: power-smart-warranty-intake
description: "Warranty intake for Power Smart: parse a warranty registration from email or phone notes, validate the serial and proof of purchase, create an Acumatica case, and prove it on screen CR306000. Use for warranty claims, serial number lookups, registration emails, or push-warranty."
---

# Power Smart warranty intake

Turn a warranty registration that arrived by email or phone into a case on the Acumatica Test tenant. AmeriSun sends customers a template for their product type, and the customer returns the filled fields.

Repo: `power-smart-poc`. CLI: `npm run acumatica -- <command>`.

Follow [show your work](../power-smart-show-your-work/SKILL.md) for the whole run: narrate each phase before you start it, record it in the transcript document, and show each milestone in the browser.

## Done when

1. The warranty payload has `claimantName`, `serialNumber`, and a `validationResult` of `validated` or `escalated`.
2. `push-warranty` exits 0 and its JSON shows `"success": true` with a case id.
3. The Cases screen (CR306000) shows the claim, and the screenshot is in the transcript with an annotation.
4. The transcript document has one entry per phase below.

## Phase 0. Credentials

Same as order intake. Run `npm run acumatica -- status` and, when it fails, follow Phase 0 of [power-smart-order-intake](../power-smart-order-intake/SKILL.md).

## Phase 1. Read the intake

Tell the user which source you are reading. Sources are a returned template email, structured form text, or the golden sample at `fixtures/sample-order-intake.txt` (Jason Mack, serial `0012412033380609022`).

The customer must have supplied these fields:

- name of purchaser, shipping address, and phone
- model number and the 19 digit serial number
- proof of purchase, meaning a receipt image or order details with date, amount, and SKU

Serial locations differ by product. On a lawn mower the serial is on the deck or the grass bag flap, and engine stickers are the wrong number. On a snow blower it is below the chute assembly. The customer templates in `fixtures/warranty-email/` spell this out.

Map exactly what the customer returned. Leave a field empty rather than inventing a value.

This phase is done when every field above is captured or its absence is noted.

## Phase 2. Look up the serial first

Check whether the serial is already registered, so a duplicate case is never created:

```bash
npm run acumatica -- lookup-warranty <serial>
```

- Found: show the existing case with `npm run acumatica -- url case <CaseID>`, record it in the transcript, and stop unless the user wants a new claim on the same unit.
- Missing and this is a registration request: draft the registration email from the matching template in `fixtures/warranty-email/`, fill in the customer's details, save the draft under `artifacts/outbound-emails/`, and show the draft to the user in the transcript before anyone sends it.

This phase is done when the lookup result and your action are recorded in the transcript.

## Phase 3. Validate

Build the warranty object. `npm run pipeline` does this automatically when the intake is structured text, writing it to the `.warranty` field of `artifacts/acumatica-payload.json`.

- The serial must be 19 numeric digits.
- Proof of purchase must be present. When it is missing, set `validationResult` to `"escalated"` and say so in your notes. The CLI maps an escalated claim to `Severity: High`.

This phase is done when `validationResult` is set and the reason is in `validationNotes`.

## Phase 4. Push the case

Narrate what you are about to push, then:

```bash
npm run acumatica -- push-warranty --file artifacts/warranty.json
```

The warranty object is the `.warranty` field of the payload, so you can also pipe it: `cat artifacts/acumatica-payload.json | jq -c '.warranty' | npm run acumatica -- push-warranty`. To push the order and the case together, use `push-both --file artifacts/acumatica-payload.json`.

Acumatica stores the claim as a Case with class `RQ` and the subject `Warranty Claim, {name}, {serial}`.

Record a transcript entry with the transfer line "artifacts/acumatica-payload.json warranty to Acumatica Case API" and the returned case id as evidence.

This phase is done when stdout JSON shows `"success": true` and you have captured the case id.

## Phase 5. Show the milestone

The case now exists, so show it:

```bash
npm run acumatica -- url case <CaseID>
```

Open the printed URL in the browser, screenshot the case, insert the image into the transcript, and annotate it, e.g. point out the serial in the subject line.

Without browser tools, fall back to `npm run verify-acumatica-ui -- "" <CaseID> <orderNumber> <serial>` and insert the screenshots it saves under `artifacts/ui-verification/`.

This phase is done when the transcript shows the annotated screenshot.

## Exceptions

| Symptom | Action |
|---|---|
| Serial is not 19 digits | Ask the customer to rescan the deck or flap barcode. Do not push. |
| Missing proof of purchase | Push with `validationResult: "escalated"` and tell the user why. |
| `push-both` half fails | Read the order and warranty results separately in the output JSON and retry only the failed half. |

## Artifacts

| Path | Purpose |
|---|---|
| `artifacts/acumatica-payload.json` | The `.warranty` object. |
| `artifacts/outbound-emails/` | Registration email drafts awaiting human send. |
| `artifacts/ui-verification/` | Fallback screenshots and check results. |
