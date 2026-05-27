# Power Smart workflow skills

Three pstack-style playbooks for the Power Smart POC. Each skill is phased, has falsifiable verification gates, and points at repo CLIs plus artifact paths.

| Skill | Workstream |
|-------|------------|
| [power-smart-order-intake](./power-smart-order-intake/SKILL.md) | Structured intake → validate → Acumatica Sales Order |
| [power-smart-warranty-intake](./power-smart-warranty-intake/SKILL.md) | Warranty email/form → validate → Acumatica Case |
| [power-smart-sps-bol](./power-smart-sps-bol/SKILL.md) | SPS xlsx → normalize → validate → DOCX BOLs (artifacts 01–08) |

Composes with Cursor pstack skills:

- **show-me-your-work** — append decisions to `decisions.tsv` at repo root during long runs
- **principle-prove-it-works** — every phase ends with a command or UI check, not assumptions
