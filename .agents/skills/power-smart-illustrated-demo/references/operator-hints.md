# Operator hints

Use these as rehearsal cues, not hidden automation.

## Camera setup

- Browser: reuse one `browser_manage` session so Outlook and Acumatica feel like one continuous tour.
- Desktop: `computer_manage(action="start", provider="cua-daytona")`, then keep LibreOffice open between source and output scenes.
- CLI: use `run_command` with bounded output. Prefer `jq` projections and the numbered SPS CSVs over full payload dumps.
- Document: create one evidence ribbon and append after every scene; never create one document per phase.

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

## Pacing

- 20–40 seconds per reveal.
- One business claim per scene.
- Pause on gates: duplicate lookup, warranty validation, BOL arithmetic.
- Use ids and counts, not adjectives.
- Close with the evidence ribbon, not a verbal recap.
