# Power Smart POC Execution Validation

Prepared: May 24, 2026

## Commands Executed

Acumatica sandbox connection used the Syed-provided `Test` tenant credentials with cookie-session auth because OAuth ROPC returned `invalid_client` without a configured Connected Application.

```sh
HOME=/tmp/powersmart-acumatica-home npm run acumatica -- status
HOME=/tmp/powersmart-acumatica-home npx --yes tsx scripts/acumatica/cli.ts push-both < artifacts/acumatica-payload.json
npm run sps-bol -- generate --source "/Users/jeremyalston/Downloads/A order BOL template.xlsx" --template "/Users/jeremyalston/Downloads/A BOL template.docx" --out "/Users/jeremyalston/Downloads/power-smart-poc/artifacts/sps-bol-run"
```

## Workflow Results

| Workflow | Result | Evidence |
|---|---|---|
| Warranty validation to Acumatica Case | Passed | Created Acumatica Case `CS17612`, class `WARRANTY`, status `New`, subject `Warranty Claim - Jason Mack - 0012412033380609022`. |
| Order intake to Acumatica Sales Order | Passed | Created Acumatica Sales Order `SO574027`, customer `C00006`, customer order `840432706992`, status `Open`. |
| SPS export to validation and BOL completion | Passed | CLI generated 4 valid BOL payloads and 4 DOCX BOLs under `artifacts/sps-bol-run/generated_bols`. |

## Acumatica Readback

Sales order readback:

| Field | Value |
|---|---|
| OrderNbr | `SO574027` |
| CustomerID | `C00006` |
| CustomerOrder | `840432706992` |
| Status | `Open` |
| Description | `Power Smart - Homedepot - Gas Lawn Mower` |

Warranty case readback:

| Field | Value |
|---|---|
| CaseID | `CS17612` |
| ClassID | `WARRANTY` |
| Status | `New` |
| Severity | `Medium` |
| Subject | `Warranty Claim - Jason Mack - 0012412033380609022` |

## SPS/BOL CLI Output

The new SPS Commerce CLI command is:

```sh
npm run sps-bol -- generate --source <xlsx> --template <docx> --out <dir>
```

Run summary:

| Metric | Count |
|---|---:|
| Raw SPS order rows | 4 |
| Destination/reference rows | 37 |
| Normalized order rows | 4 |
| Valid BOL payload rows | 4 |
| Generated BOL DOCX files | 4 |

Generated BOLs:

| BOL/SID | PO | Status |
|---|---:|---|
| `SID 232161177` | `1134488129` | generated |
| `SID 232161181` | `1134490242` | generated |
| `SID 232161087` | `1134495882` | generated |
| `SID 232161179` | `1134522652` | generated |

QA:

| Check | Result |
|---|---|
| Required BOL fields | 4/4 valid rows |
| DOCX generation | 4/4 generated |
| Unreplaced placeholders | None reported in `08_docx_qa_report.csv` |
| Render status | Structural/text QA only; LibreOffice is not installed locally for PDF render verification. |

## Code Changes

| File | Change |
|---|---|
| `scripts/acumatica/cli.ts` | Added deterministic customer resolution for order posting, including existing Home Depot customer IDs. |
| `scripts/sps-commerce/cli.ts` | Added SPS export normalization, validation, DOCX BOL generation, manifest, QA report, and summary output. |
| `package.json` | Added runnable scripts `acumatica` and `sps-bol` plus required Node dependencies. |
| `tsconfig.json` | Added TypeScript compiler configuration for CLI work. |

## Verification

Touched CLI files type-check with:

```sh
npx tsc --noEmit --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --esModuleInterop scripts/sps-commerce/cli.ts scripts/acumatica/cli.ts
```

The full repo type-check is not clean yet because the existing Convex files reference uninstalled Convex packages and NodeNext import-extension requirements.
