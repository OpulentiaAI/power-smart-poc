---
name: power-smart-show-your-work
description: "Show your work on every Power Smart run: narrate each step before taking it, keep a transcript document with annotations for every document and system transfer, and show each milestone in the browser. Use whenever a Power Smart workflow runs, and whenever the user asks what happened during a run."
---

# Show your work

The client wants to watch the work happen, not audit it afterward. Every document that moves between systems must be visible when it moves, with your note on it. This skill is the shared visibility contract for the three Power Smart use cases. Keep three habits on every run: narrate, record, and show.

## Narrate every step

Before each key step, tell the user in one or two sentences what you are about to do and why. For example: "I am pushing Jason Mack's Home Depot order to the Acumatica Test tenant now. The payload validated cleanly, and no order with this retailer number exists yet."

After the step, report what happened with the hard facts, such as the order number, the case id, or the file path. The Acumatica CLI prints plain progress sentences on stderr for exactly this purpose, so quote or paraphrase them.

Keep one active step in `todo_manage` at all times, and update `track_progress` when a phase completes.

A step is narrated when the user could retell it without opening any file.

## Keep the run transcript

The transcript is one document in the document pane. The user reads it top to bottom to see the whole run.

1. At the start of a run, create it once with `document_create`, titled "Power Smart run transcript" plus the date. Reuse the returned `docId` for every later call.
2. After each key step, add an entry with `document_append` containing four things:
   - the step name and the time
   - your annotation in plain words, meaning what you did and why
   - the transfer line, naming the document that moved and the system it moved to, e.g. "artifacts/acumatica-payload.json to the Acumatica SalesOrder API"
   - the evidence, e.g. `OrderNbr SO574027` or a generated file path
3. Insert visuals where they belong with `document_insert_artifact`. Use `artifactType: "image"` for screenshots and `artifactType: "data"` with a markdown table for CSV excerpts.

The transcript is complete when every phase of the running use case has one entry, and every milestone entry has a visual under it.

## Show milestones in the browser

A milestone is the moment a record exists in another system or a finished document exists on disk. At a milestone, show the result instead of only reporting it.

| Use case | Milestone | How to show it |
|---|---|---|
| Order intake | Sales order created | `npm run acumatica -- url sales-order <OrderNbr>` prints the deep link. Open it with `browser_navigate`, capture `browser_screenshot`, insert the image into the transcript. |
| Order intake | Invoice exists for the order | `npm run acumatica -- url invoice <RefNbr>`, then the same navigate, screenshot, and insert steps. |
| Warranty intake | Case created | `npm run acumatica -- url case <CaseID>`, then the same steps. |
| SPS BOL | Rows normalized and validated | Insert `06_validation_report.csv` as a data table artifact with a note on any invalid rows. |
| SPS BOL | BOL documents generated | Insert the text preview of one generated BOL. When a desktop is available, open the DOCX with computer use and insert a screenshot of the rendered page. |

When browser tools are unavailable, run `npm run verify-acumatica-ui -- <OrderNbr> <CaseID> <CustomerOrder> <Serial>`. It logs in headlessly, saves screenshots under `artifacts/ui-verification/`, and writes pass or fail checks to `ui-verification.json`. Insert those saved screenshots into the transcript instead.

## Annotate every visual

Under each screenshot or table, write one sentence saying what the viewer should look at. For example: "The Customer Order field shows the Home Depot order number 840432706992, which proves the push landed on the right record." A visual without an annotation is not done.
