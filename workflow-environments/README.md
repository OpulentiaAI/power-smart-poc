# Power Smart workflow environments

Production and demonstration are separate runtime bundles. Prepare both from the repository root:

```bash
npm run workflows:prepare
```

The command creates:

- `production/runtime/` — production skills, CLIs, credentials, fixtures, and templates
- `demonstration/runtime/` — its own copies of those inputs plus the illustration director and Dither dashboard

Runtime folders are ignored by Git because each contains a private credential copy and generated evidence. They never read from each other. Re-run preparation to refresh both from reviewed source files.

The separation rule is structural:

- Production email follows the production skill and requires explicit authority.
- Demonstration email is a visual draft requirement only. It must never be sent.
