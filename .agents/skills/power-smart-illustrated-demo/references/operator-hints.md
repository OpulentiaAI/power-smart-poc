# Operator hints

Use these as rehearsal cues, not hidden automation.

## Camera setup

- Browser: reuse one `browser_manage` session so Outlook and Acumatica feel like one continuous tour.
- Desktop: `computer_manage(action="start", provider="cua-daytona")`, then keep LibreOffice open between source and output scenes.
- CLI: use `run_command` with bounded output. Prefer `jq` projections and the numbered SPS CSVs over full payload dumps.
- Document: create one evidence ribbon and append after every scene; never create one document per phase.
- Dashboard: run `demo:dashboard:update` before and after every scene. Estimates are conservative display assumptions, not invoicing data.

## High-signal framing

- Order screenshot: Customer Order, Customer, Order Nbr.
- Warranty screenshot: Case ID, Subject, Serial, Severity.
- Workbook screenshot: headers plus enough populated rows to establish grain.
- BOL screenshot: Ship To, PO/customer order, cartons, weight, pallets, BOL number.
- Email screenshot: sender, subject, timestamp, requested fields, attachment names.

## CLI previews

```bash
jq '{customerName,platform,orderNumber,modelSku,serialNumber}' artifacts/acumatica-payload.json
jq '.[] | {phase,success,data,error}' artifacts/pipeline-results.json
column -s, -t < artifacts/sps-bol-run/06_validation_report.csv | sed -n '1,12p'
column -s, -t < artifacts/sps-bol-run/09_bol_arithmetic.csv | sed -n '1,12p'
```

If `column` is unavailable, use Python's `csv` module or insert the CSV as a data artifact. Do not install a utility mid-demo unless rehearsal proved it necessary.

When redirecting Acumatica JSON, use `npm run --silent acumatica -- …`; npm's normal banner makes the file unparsable.

## Pacing

- 20–40 seconds per reveal.
- One business claim per scene.
- Pause on gates: duplicate lookup, warranty validation, BOL arithmetic.
- Use ids and counts, not adjectives.
- Close with the evidence ribbon, not a verbal recap.

## Rehearsal footguns

- Do not `source intake-pack/credentials/acumatica-sandbox.env`; its login URL may contain unquoted parentheses. Run `demo:acumatica:prepare`.
- Dismiss Chrome's save-password bubble before the first proof screenshot.
- Demonstration email must be composed and shown, then left unsent. Never click Send; record `DEMONSTRATION ONLY — NOT SENT`.
- Acumatica case deep links use `CaseCD`, not `CaseID`.
- The golden order and serial may already have duplicates. A successful duplicate gate can branch to existing-record proof; never push anyway.
- To rehearse the full create path, use `demo:payload -- --unique`; do not hand-edit identifiers or reuse the golden payload.
- Store lookup and push JSON under the run directory. `/tmp` paths are not durable demo evidence.
- LibreOffice may restore a stale CSV import dialog. Close it before opening the intended XLSX/DOCX.
- Wide source sheets are unreadable at fit-to-width. Show a readable key-column crop plus a CLI-derived full-row table.
