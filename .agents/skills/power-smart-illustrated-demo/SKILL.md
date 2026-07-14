---
name: power-smart-illustrated-demo
description: "Direct a live, illustrative Power Smart client demo using real credentials and real production actions, with browser use, computer use, visible CLI, and one rich artifact document as the story. Use only for demos, walkthroughs, illustration mode, or show-me-how-it-works requests; never replace the production workflow skills."
---

# Power Smart glass-box theatre

This is a demonstration director, not a second automation engine. Run the real Power Smart commands and real web systems, but choreograph them so a client can understand the workflow as it happens.

The production skills remain authoritative:

- [order intake](../power-smart-order-intake/SKILL.md)
- [warranty intake](../power-smart-warranty-intake/SKILL.md)
- [SPS BOL](../power-smart-sps-bol/SKILL.md)

Do not edit, bypass, or reinterpret their validation and duplicate rules. This skill controls presentation, camera choice, pacing, and evidence.

## The novel device: three cameras and one evidence ribbon

Treat every scene as a cut between three live cameras:

| Camera | Opulent surface | What the client sees |
|---|---|---|
| **System camera** | `browser_manage` | Outlook/webmail and Acumatica as humans see them |
| **Document camera** | `computer_manage` with `provider: "cua-daytona"` | XLSX/DOCX files rendered in LibreOffice |
| **Truth camera** | `run_command` | Exact extraction, validation, lookup, transform, and push results |

All three cameras feed one continuously updated **evidence ribbon** in the document pane. The ribbon is a single document created with `document_manage(action="create")`. It is not a post-run report; it advances during the demo.

Each scene contributes one card:

```markdown
### Scene 04 — Safe to create
**Client question:** Could this make a duplicate?
**We saw:** No existing order for retailer order 840432706992.
**We did:** Ran the production duplicate lookup.
**Proof:** `found: 0`
**Next:** Create one Acumatica sales order.
```

Insert the scene's screenshot, table, or rendered file directly below that card with `document_manage(action="insert_artifact")`. The client should be able to scroll the ribbon and retell the story without reading raw logs.

## Before the audience joins

1. Read the matching production skill.
2. Confirm the real credentials and source files are available without exposing them.
3. Prepare Acumatica credentials without sourcing the intake `.env` file:

```bash
npm run demo:acumatica:prepare -- --env-file intake-pack/credentials/acumatica-sandbox.env
```

The source may contain an unquoted Acumatica login URL with parentheses and is not shell-sourceable. Reuse the safe `HOME=… ACUMATICA_CONFIG=…` prefix printed by the command. Never print the resulting config.

Use that prefix to run `npm run --silent acumatica -- login`, then `status`. Continue only when status is `connected`.

4. Generate a cue sheet:

```bash
npm run demo:cue-sheet -- --workflow <order|warranty|sps-bol> --run-id <slug>
```

For a create-path rehearsal using the golden intake, generate transparent unique identifiers instead of reusing the known duplicate sample:

```bash
npm run demo:payload -- --input fixtures/sample-order-intake.txt \
  --run-id <slug> --unique
```

For a real inbound customer request, preserve its identifiers and obey the normal duplicate branch.

5. Start the Dither Kit dashboard with `npm run demo:dashboard` and open its preview in the browser.
6. Initialize it with `npm run demo:dashboard:update -- --workflow <workflow> --run-id <slug>`.
7. Read `artifacts/illustrated-demo/<run-id>/cue-sheet.json`.
8. Create the evidence-ribbon document and paste the generated `storyboard.md` opening into it.
9. Start one browser session with `browser_manage(action="start")`.
10. Start one desktop with `computer_manage(action="start", provider="cua-daytona")` when the cue sheet uses the document camera.
11. Pre-open the source tab or file, but do not perform the production side effect before the demo.

The cue sheet is a stage manager, not an executor. The agent still performs every real action and verifies every result.

## Scene grammar: question, reveal, action, proof

Every scene has four beats:

1. **Question** — frame the business question, not the tool call.
2. **Reveal** — show the relevant source state with one camera.
3. **Action** — perform one real production step.
4. **Proof** — show the changed state with a different camera when possible and add it to the ribbon.

Bracket every scene with dashboard updates:

```bash
npm run demo:dashboard:update -- --workflow <workflow> --run-id <slug> \
  --scene <id> --status running --message "<business action>"

npm run demo:dashboard:update -- --workflow <workflow> --run-id <slug> \
  --scene <id> --status success --evidence "<verified outcome>" \
  --record-id "<optional system id>" --artifact "<optional artifact path>"
```

Use `--status blocked` when a gate fails. The dashboard must never claim success before fresh proof exists.

Prefer camera changes over narration. Example: show the email in Outlook, cut to the CLI extraction table, then cut to the document ribbon with highlighted fields. This makes the transformation legible without pretending the CLI is a human interface.

Do not run multiple production phases in one giant command during a demo. Use the narrowest existing command that preserves the production contract.

When capturing Acumatica JSON, use `npm run --silent acumatica -- …`; ordinary `npm run` adds banner lines and makes redirected output invalid JSON.

Write every redirected lookup and push result under `artifacts/illustrated-demo/<run-id>/`. Do not link `/tmp` evidence into the dashboard or evidence ribbon.

## Visual language

Use the same visual vocabulary throughout the evidence ribbon:

- **Blue — Source:** what arrived from a person or partner.
- **Amber — Decision:** validation, lookup, or arithmetic that gates the next step.
- **Green — Committed:** a record or document now exists.
- **Red — Needs attention:** missing, invalid, or escalated data.

Represent each transfer as `SOURCE → DECISION → DESTINATION`. Use a compact markdown table for field lineage:

| Source field | Interpreted as | Destination field | Status |
|---|---|---|---|
| Order Number | Retailer order id | Customer Order | Valid |

For spreadsheet transformations, show a three-frame contact sheet in the ribbon:

1. source workbook screenshot
2. normalized rows table
3. rendered BOL screenshot

Add a fourth arithmetic table only when pallet math is material.

## Order intake performance

Use the order cue sheet and the production order skill.

1. **Browser reveal:** open the selected intake email or web form. Crop attention to sender, subject, business fields, and attachment names.
2. **Truth reveal:** capture the intake into the run directory and run the existing extraction/validation path. Show a field-lineage table, not the entire JSON blob.
3. **Safety reveal:** run `lookup-order` visibly. Freeze on `found: 0` or show the existing order and stop.
4. **Commit:** run the production `push-order` command with real credentials.
5. **Browser proof:** open the returned sales-order deep link and highlight Customer Order, customer, and order number.
6. **Ribbon close:** place source, decision, and committed-record evidence side by side in reading order.

## Warranty performance

Use the warranty cue sheet and the production warranty skill.

1. **Browser reveal:** open the returned warranty email and show the supplied fields and attachment names.
2. **Document reveal:** open proof-of-purchase only when safe and relevant; otherwise show a redacted attachment card.
3. **Truth reveal:** show serial format, proof presence, and validation result as three large status rows.
4. **Safety reveal:** run `lookup-warranty` before creation.
5. **Commit:** run `push-warranty` with real credentials.
6. **Browser proof:** open the Acumatica case and highlight case id, subject, serial, and severity.
7. **Optional response:** generate the response body with CLI, compose it in webmail with browser use, show the draft in the ribbon, and send only when the demo authority explicitly includes sending. Prove Sent state.

## SPS BOL performance

Use the SPS cue sheet and the production SPS skill.

1. **Document reveal:** open the source XLSX in LibreOffice and focus the relevant sheet.
2. **Truth reveal:** run the production generator. Reveal its numbered outputs one at a time as a lineage animation in the ribbon: raw → normalized → valid → merged.
3. **Decision reveal:** show validation status and pallet arithmetic as compact tables. Use `sheet_manage(action="create_chart_image")` only when a chart makes the store-level comparison clearer.
4. **Document proof:** open one generated BOL in LibreOffice, zoom to ship-to, PO, cartons, weight, pallets, and BOL number.
5. **Contact sheet:** insert source workbook, transform table, and rendered BOL into the same ribbon section.

## Credential and privacy rules

- Use real credentials from the approved local configuration or connected browser session.
- Never display credential files, passwords, cookies, tokens, or browser storage.
- Before every screenshot, check for unrelated inbox rows, tabs, notifications, or customer data.
- Dismiss Chrome's password-save prompt immediately after login; it obscures the first Acumatica proof scene.
- Redact with a generated preview rather than editing the source.
- Real side effects obey the production skill's duplicate checks and human-approval rules.

## Recovery without breaking the story

- If a camera fails, keep the current scene open and switch cameras; do not silently skip proof.
- If the production action fails, turn the scene card red, insert the exact bounded error, and stop the story at that gate.
- Never substitute fake ids, screenshots, or pre-generated success artifacts for a failed live step.
- A pre-generated artifact may be used only as a labeled rehearsal prop before the live action.

## Done when

- The original production skill ran without changed semantics.
- Every cue-sheet scene has a question, live action, and fresh proof.
- The evidence ribbon contains at least one browser image, one CLI-derived table, and one desktop image when documents are involved.
- The Dither Kit dashboard reaches the same terminal state and shows scene success, system evidence, ids, and conservative projected labor time saved.
- All real record ids and generated files are linked in the closing card.
- The client can distinguish source data, gating decisions, and committed outcomes at a glance.
