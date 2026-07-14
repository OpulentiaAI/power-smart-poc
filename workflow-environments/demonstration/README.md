# Demonstration runtime

Run `npm run workflows:prepare` from the repository root, then:

```bash
cd workflow-environments/demonstration/runtime
npm install
npm --prefix demo-dashboard install
npm run verify-illustrated-demo
```

This bundle contains independent copies of credentials, fixtures, templates, production CLIs, the illustration director, and the Dither dashboard. Do not import files from `../../production/runtime`.

Email is demonstration-only: compose and display a draft, add it to the evidence ribbon, and **never send it**.

Run Acumatica commands with `HOME="$PWD" ACUMATICA_CONFIG="$PWD/.acumatica-config.json"` so config and cookies remain inside this folder.
