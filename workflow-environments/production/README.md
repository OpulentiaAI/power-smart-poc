# Production runtime

Run `npm run workflows:prepare` from the repository root, then:

```bash
cd workflow-environments/production/runtime
npm install
HOME="$PWD" ACUMATICA_CONFIG="$PWD/.acumatica-config.json" npm run verify-automation
```

This bundle contains independent copies of production credentials, fixtures, templates, skills, and CLIs. Do not import files from `../../demonstration/runtime`.

Production side effects follow the production skills. Email sending remains authority-gated.
