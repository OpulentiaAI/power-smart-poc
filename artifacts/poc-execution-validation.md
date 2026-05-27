# Power Smart POC — execution validation (2026-05-26)

## Workflows run

| Workflow | Command | Result |
|----------|---------|--------|
| Order intake | `npm run pipeline` | ✓ Extract, validate, push |
| Warranty | `push-both` (warranty half) | ✓ Case created |
| SPS BOL | `npm run sps-bol -- generate ...` | ✓ 4 valid rows, 4 DOCX |
| Automation checks | `npm run verify-automation` | ✓ 14/14 |
| Acumatica verify | `npm run verify-acumatica-ui -- SO574030 CS17615 ...` | ✓ API + session |

## Acumatica postings (Test tenant)

| Entity | ID | Customer order / subject |
|--------|-----|--------------------------|
| Sales Order | **SO574030** | Customer order `840432706992` |
| Warranty Case | **CS17615** | Serial `0012412033380609022` |

Evidence: `artifacts/pipeline-results.json`, `artifacts/ui-verification/ui-verification.json`, Playwright screenshots under `artifacts/ui-verification/`.

## SPS BOL

Output: `artifacts/sps-bol-run/` (artifacts 01–08, `generated_bols/`, `automation_summary.json`).

## Skills

- `skills/power-smart-order-intake/SKILL.md`
- `skills/power-smart-warranty-intake/SKILL.md`
- `skills/power-smart-sps-bol/SKILL.md`

## OpulentiaAI repo

Push to `OpulentiaAI/power-smart-poc` requires `gh auth login` (current token invalid). Local branch ready after commit on `main` or feature branch.
