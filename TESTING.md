# Testing the Power Smart POC

This is a test runbook for a general coding agent, such as Claude Code or Cursor. It is not the Opulent runbook. The Opulent playbooks live in `.agents/skills/` and assume Opulent's document pane and browser tools, which a plain agent does not have. This guide uses only the shell and the repo's CLIs.

Repository: https://github.com/OpulentiaAI/power-smart-poc

The goal is to prove the three use cases end to end: order intake, warranty intake, and SPS bill of lading generation. Some steps reach a live Acumatica demo sandbox, and some run fully offline.

## What you need

- Node.js 18 or newer. `curl` on the path, used for the Acumatica cookie login.
- Network access to `amerisuninc.acumatica.com` for the live steps. The SPS BOL steps and the extraction checks run offline.

## Step 1. Clone and install

```bash
git clone https://github.com/OpulentiaAI/power-smart-poc
cd power-smart-poc
npm install
```

## Step 2. Structure and offline checks

Run the automation verification first. It confirms the files exist, runs the extraction smoke test, and checks the SPS golden artifacts.

```bash
npm run verify-automation
```

Expected: every line is a check mark, except the last line, which fails only because the Acumatica config is not written yet. You write that config in Step 3.

You can also run the extraction on its own:

```bash
npm run pipeline
```

Expected: the pipeline extracts 10 of 10 fields for Jason Mack, validation passes, and it writes `artifacts/acumatica-payload.json`. The push phase inside the pipeline fails until the config exists, which is expected at this point.

## Step 3. Write the Acumatica config

The demo sandbox settings are in `intake-pack/credentials/acumatica-sandbox.env`. The CLI reads a JSON config at `~/.acumatica-config.json` and needs the clean base URL, not the login URL from the env file. Write it like this:

```bash
cat > ~/.acumatica-config.json << 'EOF'
{
  "baseUrl": "https://amerisuninc.acumatica.com",
  "tenant": "Test",
  "username": "Agent",
  "password": "Agent.ai!",
  "company": "AmeriSun Inc. - Test"
}
EOF
chmod 600 ~/.acumatica-config.json
```

To keep the config out of your home directory, write it somewhere in the repo scratch space and point the CLI at it instead:

```bash
export ACUMATICA_CONFIG="$PWD/.acumatica-config.local.json"
```

Then log in and confirm the connection:

```bash
npm run acumatica -- login
npm run acumatica -- status
```

Expected: `status` prints `"status": "connected"` and names the auth method, which is `cookie` on this sandbox.

## Step 4. Test order intake

First look for an existing order, so the test does not create a duplicate:

```bash
npm run acumatica -- lookup-order --customer-order 840432706992
```

Extract the order object from the pipeline payload and push it:

```bash
cat artifacts/acumatica-payload.json | node -e "const d=require('fs').readFileSync(0,'utf8');process.stdout.write(JSON.stringify(JSON.parse(d).order))" > /tmp/order.json
npm run acumatica -- push-order --file /tmp/order.json
```

Expected: stdout JSON shows `"success": true` and a new `OrderNbr`. The stderr narration prints the resolved customer, such as `C00006 (home_depot_canada)`, and the next-step commands.

Get the browser deep link for the created order:

```bash
npm run acumatica -- url sales-order <OrderNbr>
```

Expected: a JSON object with a URL to screen SO301000 for that order. Open it in a browser to confirm the record shows the customer order number 840432706992.

## Step 5. Test warranty intake

Look up the serial first:

```bash
npm run acumatica -- lookup-warranty 0012412033380609022
```

Extract the warranty object and push it:

```bash
cat artifacts/acumatica-payload.json | node -e "const d=require('fs').readFileSync(0,'utf8');process.stdout.write(JSON.stringify(JSON.parse(d).warranty))" > /tmp/warranty.json
npm run acumatica -- push-warranty --file /tmp/warranty.json
```

Expected: stdout JSON shows `"success": true` and a case id. Get its deep link with `npm run acumatica -- url case <CaseID>` and open it on screen CR306000 to confirm the serial is in the subject.

To push the order and the warranty together instead of separately, use one payload:

```bash
npm run acumatica -- push-both --file artifacts/acumatica-payload.json
```

## Step 6. Test SPS bill of lading generation

This runs offline. The source workbook and the Word template are in the intake pack:

```bash
npm run sps-bol -- generate \
  --source "intake-pack/assets/A order BOL template.xlsx" \
  --template "intake-pack/assets/A BOL template.docx" \
  --out "artifacts/sps-bol-run"
```

Expected: the summary JSON reports 4 valid payload rows and 4 generated BOL documents with 0 unreplaced placeholders. Check the outputs:

```bash
cat artifacts/sps-bol-run/06_validation_report.csv
cat artifacts/sps-bol-run/09_bol_arithmetic.csv
ls artifacts/sps-bol-run/generated_bols/
cat artifacts/sps-bol-run/previews/*.txt | head -40
```

Confirm that `06_validation_report.csv` lists every row as valid, that `09_bol_arithmetic.csv` pallet counts match the store rates, and that a preview shows the ship to name, the PO, and the BOL number.

## Step 7. Optional browser verification

When a browser is available, verify a pushed order and case headlessly with Playwright:

```bash
npm run verify-acumatica-ui -- <OrderNbr> <CaseID> 840432706992 0012412033380609022
```

Expected: it logs in, opens screens SO301000 and CR306000, saves screenshots under `artifacts/ui-verification/`, and writes pass or fail checks to `artifacts/ui-verification/ui-verification.json`. The API checks are the authoritative result; the on-screen text checks can be inconclusive because Acumatica renders as a single page app.

## Pass criteria

- `npm run verify-automation` passes every check once the config exists.
- Order intake and warranty intake each return `"success": true` with an id, and the deep link shows the record.
- SPS generation reports 4 valid rows, 4 documents, and 0 unreplaced placeholders.

## Notes

- The `intake-pack/credentials/acumatica-sandbox.env` file holds demo sandbox credentials. Treat them as demo only.
- The BOL walkthrough recording in `intake-pack/bol-walkthrough.url` needs a Power Smart SharePoint session to open. Start at 2:40 for the shipping order walkthrough.
- Pushing real orders and cases writes to the live sandbox. Use `lookup-order` and `lookup-warranty` before pushing so the test does not create duplicates.
