---
name: power-smart-sps-bol
description: "SPS Commerce BOL generation for Power Smart: read the order export workbook, normalize and validate the rows, merge the Word template, and show every transform from spreadsheet to finished bill of lading. Use for bill of lading requests, sps-bol generate, or the SPS Commerce workbook."
---

# Power Smart SPS BOL generation

Generate bills of lading from the Power Smart SPS export workbook and the Word template. Every run is a chain of document transfers, and the client wants to see each link: raw spreadsheet rows to normalized rows, normalized rows to a validated payload, payload to merged DOCX files.

Repo: `power-smart-poc`. CLI: `npm run sps-bol -- generate`.

Follow [show every step](../power-smart-show-your-work/SKILL.md) for the whole run. All actions use `browser_manage`, `computer_manage`, or visible `run_command` calls.

## Done when

1. Artifacts 01 through 09 and `automation_summary.json` exist under the output directory.
2. `06_validation_report.csv` shows only valid rows, or each invalid row is explained in the transcript.
3. The DOCX count in `generated_bols/` matches the valid row count in the manifest.
4. The source workbook is shown in LibreOffice before transformation.
5. The transcript shows raw, normalized, validation, and arithmetic tables plus at least one rendered BOL, each with an annotation.

## Phase 1. Locate the inputs

Tell the user which files you are using:

| File | Typical path |
|---|---|
| Source workbook | `~/Downloads/A order BOL template.xlsx` (tabs `Sheet1` and `Sheet2`) |
| Word template | `~/Downloads/A BOL template.docx` |
| Output directory | `./artifacts/sps-bol-run` |

The template holds merge placeholders such as `«Name»`, `«PO_»`, `«QTY»`, `«Carrier»`, and `«BOL_Number»`. The full placeholder map is written to `04_bol_field_mapping.csv` on every run.

Start computer use and open the source workbook in LibreOffice. Show the relevant source tab and its headers with a desktop screenshot. Then open the Word template and show the merge fields. Record both source states before running the CLI.

This phase is done when both input files exist at confirmed paths and both have fresh desktop screenshots.

## Phase 2. Generate

This runs offline and needs no SPS API access. Execute it with one visible `run_command` call:

```bash
npm run sps-bol -- generate \
  --source "<workbook path>" \
  --template "<template path>" \
  --out "./artifacts/sps-bol-run"
```

The command writes the numbered artifacts, one DOCX per valid row under `generated_bols/`, and a text preview per DOCX under `previews/`. Its stdout JSON is the run summary.

After generation, use bounded `run_command` previews to show each CSV as a table. Record one transcript entry per transfer in the chain:

| Transfer | Evidence artifact |
|---|---|
| Workbook `Sheet1` to raw rows | `01_sps_export_raw.csv` |
| Raw rows to normalized rows | `03_normalized_orders.csv` |
| Normalized rows to validated payload | `05_bol_payload.csv` and `06_validation_report.csv` |
| Payload rows to merged DOCX files | `07_output_manifest.csv` and `generated_bols/*.docx` |

This phase is done when the summary JSON reports the expected row counts.

## Phase 3. Show the transforms

These are the milestones for this use case. In the transcript:

1. Insert `01_sps_export_raw.csv` and `03_normalized_orders.csv` as bounded data tables. Annotate the row count and renamed/normalized fields.
2. Insert `06_validation_report.csv` as a data table artifact. Annotate the count of valid rows and name any missing fields on invalid rows. A required field that is empty means the source row must be fixed in the workbook and the generate step run again.
3. Insert `09_bol_arithmetic.csv` as a data table artifact. Annotate whether each store's pallet count matches the expected value.
4. Insert the text preview of at least one generated BOL from `previews/`, and annotate the ship-to name, PO, and BOL number.
5. Open the corresponding DOCX in LibreOffice with `computer_manage` and insert a fresh screenshot of the rendered page.

This phase is done when all five visuals are in the transcript with annotations.

## Phase 4. Verify

```bash
npm run verify-automation
```

This checks that the golden artifacts exist, that the summary reports at least one valid row, and that every manifest path exists on disk. Record the result in the transcript.

When the reference outputs exist at `~/Downloads/bol_automation_outputs`, also diff the validation report against them and record any delta:

```bash
diff -q artifacts/sps-bol-run/06_validation_report.csv ~/Downloads/bol_automation_outputs/06_validation_report.csv
```

This phase is done when `verify-automation` passes and any reference delta is explained.

## Reference: required fields per BOL row

`name`, `address_1`, `city`, `state`, `zip`, `po`, `qty`, `weight`, `carrier`, and `bol_number` are required. `customer_order_no`, `pallet`, and the rest are optional. The validator lists the exact missing fields per row in `06_validation_report.csv`.

## Reference: pallet arithmetic per store

Each Home Depot store has its own cartons per pallet rate, configured in `fixtures/sps-entity-qty-per-pallet.json`:

| Store | Cartons per pallet |
|---|---|
| #6777 | 12 |
| #6760 | 12 |
| #6707 | 11.5 |
| #5857 | 11 |

The expected pallet count is the total cartons divided by the store rate, rounded up. The golden check is SID 232161177: 70 cartons, 6 pallets, 5110 lbs, with a partial final pallet of 10 cartons.

## Exceptions

| Symptom | Action |
|---|---|
| Missing required field | Fix the source row in the workbook and run generate again. |
| `not_rendered` in the QA report | Word rendering is optional. The text preview and `08_docx_qa_report.csv` are the check. |
| Placeholder left in a DOCX | Compare `04_bol_field_mapping.csv` against the template, e.g. `«PO_»` versus `PO`. |
| Live SPS API wanted | Only with a bearer token: `npm run sps-bol -- auth setup`, then `config --token`, then `status`. Generation works without it. |

## Artifacts for audit

When proving a run to AmeriSun, attach `automation_summary.json`, `07_output_manifest.csv`, and one sample DOCX.
