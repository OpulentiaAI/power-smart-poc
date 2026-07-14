# Power Smart workflow skills

Playbooks for the Power Smart POC, written for the Opulent agent. Opulent scans this directory (`.agents/skills/`) at runtime and routes by each skill's description.

One production skill per use case, plus one shared contract and one opt-in illustration director:

| Skill | Use case |
|---|---|
| [power-smart-order-intake](./power-smart-order-intake/SKILL.md) | Structured order text to an Acumatica sales order, proven on screen SO301000. |
| [power-smart-warranty-intake](./power-smart-warranty-intake/SKILL.md) | Warranty email or phone notes to an Acumatica case, proven on screen CR306000. |
| [power-smart-sps-bol](./power-smart-sps-bol/SKILL.md) | SPS export workbook to validated bill of lading DOCX files, with every transform shown. |
| [power-smart-show-your-work](./power-smart-show-your-work/SKILL.md) | The visibility contract the other three follow: narrate each step, keep an annotated transcript document, and show milestones in the browser. |
| [power-smart-illustrated-demo](./power-smart-illustrated-demo/SKILL.md) | Client demonstration mode: preserve the production workflows, but stage their real actions as a browser/desktop/CLI story inside one rich artifact document. Invoke only for illustration or a live demo. |

Every use-case skill is phased, and every phase ends with a checkable done condition. The show your work skill is the single source of truth for narration, the transcript document, and browser milestones, so the use-case skills reference it instead of repeating it.

Illustration requests must not rewrite or weaken the production skills. The illustrated-demo skill acts as a director around them and uses their existing CLIs and validation rules.
