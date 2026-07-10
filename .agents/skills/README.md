# Power Smart workflow skills

Playbooks for the Power Smart POC, written for the Opulent agent. Opulent scans this directory (`.agents/skills/`) at runtime and routes by each skill's description.

One skill per use case, plus one shared contract:

| Skill | Use case |
|---|---|
| [power-smart-order-intake](./power-smart-order-intake/SKILL.md) | Structured order text to an Acumatica sales order, proven on screen SO301000. |
| [power-smart-warranty-intake](./power-smart-warranty-intake/SKILL.md) | Warranty email or phone notes to an Acumatica case, proven on screen CR306000. |
| [power-smart-sps-bol](./power-smart-sps-bol/SKILL.md) | SPS export workbook to validated bill of lading DOCX files, with every transform shown. |
| [power-smart-show-your-work](./power-smart-show-your-work/SKILL.md) | The visibility contract the other three follow: narrate each step, keep an annotated transcript document, and show milestones in the browser. |

Every use-case skill is phased, and every phase ends with a checkable done condition. The show your work skill is the single source of truth for narration, the transcript document, and browser milestones, so the use-case skills reference it instead of repeating it.
