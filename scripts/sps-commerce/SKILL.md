# Power Smart SPS Commerce BOL CLI

Agent-first CLI for the third Power Smart SOW workflow: SPS Commerce export cleanup, BOL validation, and bill-of-lading DOCX generation.

Built using the repo's TypeScript Printing Press runtime in `lib/printing-press-ts/runtime.ts`.

## Access Commands

SPS Commerce's public standards state that SPS APIs use Auth0/OAuth2 bearer-token authentication. The public API reference workspace requires sign-in, so the CLI supports local bearer-token setup and optional probing of account-specific endpoints without hard-coding private API paths.

```bash
npm run sps-bol -- auth setup
npm run sps-bol -- config --base-url "https://api.spscommerce.com" --token "$SPS_COMMERCE_ACCESS_TOKEN"
npm run sps-bol -- status
npm run sps-bol -- status --probe-url "https://customer-specific.sps.endpoint/..."
```

Credential lookup order:

1. `SPS_COMMERCE_ACCESS_TOKEN`
2. `SPS_ACCESS_TOKEN`
3. Local config file at `~/.config/sps-commerce.json`

## BOL Command

```bash
npm run sps-bol -- generate \
  --source "/path/to/A order BOL template.xlsx" \
  --template "/path/to/A BOL template.docx" \
  --out "artifacts/sps-bol-run"
```

## Input Contract

The source workbook must contain:

| Sheet | Purpose |
|---|---|
| `Sheet1` | SPS/order export rows. |
| `Sheet2` | Destination/reference rows. |

Required BOL fields after normalization:

`name`, `address_1`, `city`, `state`, `zip`, `po`, `qty`, `weight`, `carrier`, `bol_number`.

The template DOCX must contain merge placeholders such as `Name`, `Address_1`, `PO_`, `QTY`, `Weight`, `Carrier`, `BOL_Number`, `Customer_Order_No`, `Pallet`, and `Model`.

## Output Contract

The CLI writes these files under `--out`:

| File | Purpose |
|---|---|
| `01_sps_export_raw.csv` | Raw workbook rows. |
| `02_destination_reference.csv` | Destination/reference rows. |
| `03_normalized_orders.csv` | Canonical order rows. |
| `04_bol_field_mapping.csv` | Template placeholder map. |
| `05_bol_payload.csv` | Valid merge payload rows. |
| `06_validation_report.csv` | Required-field status and missing fields. |
| `07_output_manifest.csv` | Generated DOCX and preview paths. |
| `08_docx_qa_report.csv` | Unreplaced-placeholder report. |
| `automation_summary.json` | Machine-readable run summary. |
| `generated_bols/*.docx` | One BOL per valid SPS row. |
| `previews/*.txt` | Structural text preview for each generated DOCX. |

## Verified Run

Verified on May 24, 2026 using Power Smart source workbook and BOL template:

| Metric | Result |
|---|---:|
| Raw SPS rows | 4 |
| Destination/reference rows | 37 |
| Valid payload rows | 4 |
| Generated BOL DOCX files | 4 |
| Unreplaced placeholders | 0 |

Generated BOLs:

| BOL/SID | PO |
|---|---:|
| `SID 232161177` | `1134488129` |
| `SID 232161181` | `1134490242` |
| `SID 232161087` | `1134495882` |
| `SID 232161179` | `1134522652` |

## Constraints

- DOCX QA is structural unless LibreOffice/soffice is available for visual rendering.
- The command intentionally stops at document generation and manifest output; carrier portal submission is not implemented.
- Account-specific SPS API endpoints require customer-provisioned SPS Dev Center access and should be supplied via `--probe-url` or future workflow-specific commands.
