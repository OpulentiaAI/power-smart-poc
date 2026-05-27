---
name: power-smart-sps-bol
description: "SPS Commerce BOL automation: ingest A order BOL xlsx, normalize rows, validate required ship fields, merge DOCX template, emit artifacts 01–08 and generated_bols. Use for sps-bol generate, bill of lading, bol_automation_outputs, or SPS Commerce validation."
disable-model-invocation: true
---

# Power Smart — SPS Commerce BOL

Phased playbook for generating Bills of Lading from the Power Smart SPS export workbook and Word template. Produces the same artifact numbering as `bol_automation_outputs` (01–08 CSVs, DOCX QA, automation summary).

Repo: `power-smart-poc`. CLI: `npm run sps-bol -- generate`.

## Definition of done

1. All eight CSV artifacts exist under `--out` directory.
2. `06_validation_report.csv` shows only `valid` rows (or documented skips).
3. `generated_bols/*.docx` count matches valid rows in manifest.
4. `automation_summary.json` reports `status: success` (or equivalent).
5. Optional: `npm run sps-bol -- status` probe passes when `SPS_COMMERCE_ACCESS_TOKEN` is set.

## Phase 0 — inputs

Default paths (adjust if files moved):

| File | Typical path |
|------|----------------|
| Source xlsx | `~/Downloads/A order BOL template.xlsx` |
| Template docx | `~/Downloads/A BOL template.docx` |
| Output dir | `./artifacts/sps-bol-run` |

Template placeholders: `«Name»`, `«Address_1»`, `«City»`, `«State»`, `«Zip»`, `«PO_»`, `«QTY»`, `«Weight»`, `«Carrier»`, `«BOL_Number»`, etc. (see `FIELD_MAPPING` in `scripts/sps-commerce/cli.ts`).

## Phase 1 — generate (offline, no SPS API required)

```bash
cd power-smart-poc
npm run sps-bol -- generate \
  --source "/Users/jeremyalston/Downloads/A order BOL template.xlsx" \
  --template "/Users/jeremyalston/Downloads/A BOL template.docx" \
  --out "./artifacts/sps-bol-run"
```

## Required fields checklist (per BOL row)

| Field | Required | Source |
|-------|----------|--------|
| name | ✓ | Ship-to customer/store name |
| address_1 | ✓ | Ship-to street address |
| city | ✓ | Ship-to city |
| state | ✓ | Ship-to state |
| zip | ✓ | Ship-to ZIP |
| po | ✓ | Customer purchase order |
| qty | ✓ | Carton/package quantity |
| weight | ✓ | Shipment weight |
| carrier | ✓ | Carrier name |
| bol_number | ✓ | Bill of lading number |
| pallet | ✓ | Pallet count |
| customer_order_no | optional | Additional shipper info |

| Artifact | Purpose |
|----------|---------|
| `01_sps_export_raw.csv` | Raw export columns |
| `02_destination_reference.csv` | Destination lookup |
| `03_normalized_orders.csv` | Normalized snake_case rows |
| `04_bol_field_mapping.csv` | Template ↔ payload mapping |
| `05_bol_payload.csv` | Rows ready for merge |
| `06_validation_report.csv` | Per-row valid/invalid (+ missing fields checklist) |
| `07_output_manifest.csv` | Generated DOCX paths |
| `08_docx_qa_report.csv` | Preview/QA status |
| `09_bol_arithmetic.csv` | Entity-specific pallet/weight calculations |
| `automation_summary.json` | Run metadata |
| `generated_bols/*.docx` | One BOL per valid row |
| `previews/*.txt` | Text previews |

## Phase 2 — verification gates

```bash
npm run verify-automation
```

| Check | Pass when |
|-------|-----------|
| Golden files | 01, 06, 07, summary exist under `artifacts/sps-bol-run` |
| Row count | `automation_summary.json` valid_rows ≥ 1 |
| DOCX | manifest paths exist on disk |

Manual spot-check: open one `generated_bols/SID_*.docx` — ship-to name, PO, BOL number populated.

## Phase 3 — live SPS API (optional)

Only when bearer token available:

```bash
npm run sps-bol -- auth setup
export SPS_COMMERCE_ACCESS_TOKEN="<token>"
npm run sps-bol -- config --token "$SPS_COMMERCE_ACCESS_TOKEN"
npm run sps-bol -- status
```

Generate still works offline; API phases add probe/status only.

## Phase 4 — compare to reference run

If `~/Downloads/bol_automation_outputs` exists, diff row counts and validation:

```bash
diff -q artifacts/sps-bol-run/06_validation_report.csv \
  ~/Downloads/bol_automation_outputs/06_validation_report.csv
```

| Check | Pass when |
|-------|-----------|
| Validation parity | Same number of valid rows (or documented delta) |
| BOL numbers | SID/BOL numbers align with source xlsx |

## Entity-specific arithmetic (per-row pallet calculations)

Each Home Depot store has its own cartons-per-pallet rate from operations reference.
The `09_bol_arithmetic.csv` artifact validates pallet logic per store.

| Store | Entity qty/pallet rate |
|-------|------------------------|
| #6777 | 12 |
| #6760 | 12 |
| #6707 | 11.5 |
| #5857 | 11 |

Formula: `expected_pallet_count = ceil(total_cartons / entity_rate)`

| BOL section | Field | Source column |
|-------------|-------|---------------|
| CUSTOMER ORDER INFORMATION | # PKGS | customer_order_pkgs (qty) |
| CUSTOMER ORDER INFORMATION | WEIGHT | grand_total_weight_lbs |
| CUSTOMER ORDER INFORMATION | PALLET | handling_unit_pallet_qty |
| CARRIER INFORMATION | HANDLING UNIT QTY | handling_unit_pallet_qty |
| CARRIER INFORMATION | PACKAGE QTY | package_carton_qty |
| CARRIER INFORMATION | PACKAGE WEIGHT | grand_total_weight_lbs |
| GRAND TOTAL | Pallet/Carton/Weight | Same values repeated |

Golden validation (SID 232161177):
- customer_order_pkgs: 70
- handling_unit_pallet_qty: 6
- grand_total_weight_lbs: 5110
- cartons_per_pallet: 11.67
- notes: "partial final pallet: 10 cartons on last of 6 pallets (12/pallet)"

Config: `fixtures/sps-entity-qty-per-pallet.json`

| Symptom | Action |
|---------|--------|
| Missing required field | Fix source row in xlsx; re-run generate |
| `not_rendered` in QA | Preview txt still valid; Word render is optional |
| Template mismatch | Confirm `«PO_»` vs `PO` mapping in `04_bol_field_mapping.csv` |
| Import runtime.js fails | Run via `npm run sps-bol` (tsx resolves `.ts`) |

## Video / workflow docs

Reference annotations may live in upstream `bol_automation_outputs/video_annotations.md` — use for human demo sync, not for CLI execution.

## Artifacts for audit

Commit or attach `automation_summary.json`, `07_output_manifest.csv`, and one sample DOCX when proving a run to AmeriSun/Syed.
