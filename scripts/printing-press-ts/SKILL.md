# TypeScript Printing Press Runtime

Use this when adapting `mvanhorn/cli-printing-press` CLI conventions into TypeScript services in this repo.

## Pattern

The TypeScript adaptation keeps the printing-press behavior contract:

| Printing Press convention | TypeScript runtime location |
|---|---|
| Agent-first JSON output | `printJson()` in `lib/printing-press-ts/runtime.ts` |
| Credential discovery from canonical env vars | `resolveBearerToken()` |
| Local config file with masked display | `readConfig()`, `writeConfig()`, `mask()` |
| `auth setup` guidance | `showAuthSetup()` |
| `status` / optional live probe | `probeBearerStatus()` |

## Scaffold Command

```bash
npm run printing-press-ts -- scaffold --manifest service.json --out scripts/<service>
```

Manifest shape:

```json
{
  "service": "sps-commerce",
  "baseUrl": "https://api.spscommerce.com",
  "tokenEnvVars": ["SPS_COMMERCE_ACCESS_TOKEN", "SPS_ACCESS_TOKEN"],
  "authKeyUrl": "https://developercenter.spscommerce.com/",
  "authInstructions": "Create/sign into SPS Dev Center and provision OAuth/Auth0 access for the target API."
}
```

## Rules

- Do not infer private API endpoints from a marketing site.
- Prefer official API references and vendor auth standards.
- Keep status checks non-destructive.
- Allow `--probe-url` for customer-specific endpoints that require account-specific SPS access.
