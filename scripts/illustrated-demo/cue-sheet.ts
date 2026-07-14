#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

type Workflow = "order" | "warranty" | "sps-bol";
type Camera = "browser" | "desktop" | "cli" | "document";

interface Scene {
  id: string;
  title: string;
  camera: Camera;
  clientQuestion: string;
  reveal: string;
  action: string;
  proof: string;
  color: "blue" | "amber" | "green" | "red";
  manualMinutes: number;
  automatedMinutes: number;
}

const scenes: Record<Workflow, Scene[]> = {
  order: [
    scene("01", "The request arrives", "browser", "What did the customer actually send?", "Open the selected intake email or form.", "Capture only the selected intake and attachments.", "Fresh source screenshot and captured intake path.", "blue", 5, 1),
    scene("02", "Fields become structured", "cli", "How does free-form intake become order data?", "Show a bounded source preview.", "Run production extraction and validation.", "Field-lineage table with validation statuses.", "amber", 8, 1),
    scene("03", "The duplicate gate", "cli", "Could a retry create another order?", "Show the retailer order id.", "Run lookup-order before any push.", "found: 0, or the existing order id and a stop.", "amber", 4, 1),
    scene("04", "One order is committed", "cli", "What exactly crosses into Acumatica?", "Show the bounded order payload.", "Run the production push-order command.", "Successful result with OrderNbr.", "green", 6, 1),
    scene("05", "The system of record agrees", "browser", "Can we see the same order in Acumatica?", "Open the CLI-produced deep link.", "Navigate to the sales-order record.", "Screenshot of Customer Order, customer, and OrderNbr.", "green", 4, 1),
    scene("06", "Evidence ribbon", "document", "Can the whole journey be audited at a glance?", "Arrange source, gate, and committed record in order.", "Insert artifacts and final ids.", "Complete source → decision → destination ribbon.", "green", 5, 1),
  ],
  warranty: [
    scene("01", "The warranty request arrives", "browser", "What evidence did the customer provide?", "Open the selected email and attachment list.", "Capture only the claim fields and safe attachment metadata.", "Fresh source screenshot and intake path.", "blue", 7, 1),
    scene("02", "Eligibility becomes visible", "cli", "Is the serial valid and is proof present?", "Show the three warranty gate fields.", "Run production parsing and validation.", "Serial, proof, and validation status rows.", "amber", 10, 1),
    scene("03", "The registration gate", "cli", "Is this serial already registered?", "Show the serial selected for lookup.", "Run lookup-warranty before creation.", "Missing result, or existing CaseID and a stop.", "amber", 5, 1),
    scene("04", "One case is committed", "cli", "What enters Acumatica?", "Show the bounded warranty payload.", "Run the production push-warranty command.", "Successful result with CaseID.", "green", 7, 1),
    scene("05", "The case is visible", "browser", "Does Acumatica show the same claim?", "Open the CLI-produced case deep link.", "Navigate to the case record.", "Screenshot of CaseID, subject, serial, and severity.", "green", 4, 1),
    scene("06", "The response is staged", "browser", "What will the customer receive next?", "Show the generated response as a webmail draft.", "Send only when explicitly authorized.", "Draft screenshot and, if sent, proof in Sent.", "blue", 8, 2),
  ],
  "sps-bol": [
    scene("01", "The shipping sheet", "desktop", "What rows did SPS provide?", "Open the XLSX in LibreOffice on the relevant sheet.", "Frame headers and populated rows.", "Fresh source-workbook screenshot.", "blue", 8, 1),
    scene("02", "Rows gain lineage", "cli", "How does each sheet row become BOL data?", "Show raw row count and headers.", "Run the production SPS generator.", "Raw and normalized tables with stable row ids.", "amber", 25, 2),
    scene("03", "The shipping gates", "cli", "Are the fields and pallet math safe?", "Show validation and arithmetic inputs.", "Read validation and arithmetic outputs.", "Valid-row count and store-level pallet evidence.", "amber", 20, 2),
    scene("04", "Documents are minted", "cli", "Which BOL files were created?", "Show the valid payload count.", "Read the output manifest.", "Manifest paths matching generated DOCX count.", "green", 35, 3),
    scene("05", "The BOL renders", "desktop", "Does the finished document look right?", "Open one generated DOCX in LibreOffice.", "Zoom to identifying shipment fields.", "Rendered BOL screenshot without merge placeholders.", "green", 10, 1),
    scene("06", "Transformation contact sheet", "document", "Can we see source, decision, and output together?", "Arrange workbook, tables, and BOL in one section.", "Insert the three camera artifacts.", "Complete visual contact sheet and manifest link.", "green", 8, 1),
  ],
};

function scene(
  id: string,
  title: string,
  camera: Camera,
  clientQuestion: string,
  reveal: string,
  action: string,
  proof: string,
  color: Scene["color"],
  manualMinutes: number,
  automatedMinutes: number,
): Scene {
  return { id, title, camera, clientQuestion, reveal, action, proof, color, manualMinutes, automatedMinutes };
}

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function isWorkflow(value: string | undefined): value is Workflow {
  return value === "order" || value === "warranty" || value === "sps-bol";
}

const args = process.argv.slice(2);
const workflow = argValue(args, "--workflow");
const runId = argValue(args, "--run-id");
const outputRoot = argValue(args, "--out") ?? "artifacts/illustrated-demo";

if (!isWorkflow(workflow) || !runId) {
  console.error("Usage: npm run demo:cue-sheet -- --workflow <order|warranty|sps-bol> --run-id <slug> [--out <dir>]");
  process.exit(1);
}

const outputDir = path.resolve(outputRoot, runId);
fs.mkdirSync(outputDir, { recursive: true });

const cueSheet = {
  mode: "illustration",
  workflow,
  runId,
  productionSemantics: "unchanged",
  generatedAt: new Date().toISOString(),
  evidenceRibbonTitle: `Power Smart illustrated ${workflow} — ${runId}`,
  scenes: scenes[workflow],
};

const storyboard = [
  `# ${cueSheet.evidenceRibbonTitle}`,
  "",
  `**Mode:** Illustration around the unchanged production workflow`,
  "",
  `**Visual grammar:** Source (blue) → Decision (amber) → Committed (green)`,
  `**Savings model:** Conservative scene-level estimates; ${cueSheet.scenes.reduce((sum, item) => sum + item.manualMinutes, 0)} manual minutes versus ${cueSheet.scenes.reduce((sum, item) => sum + item.automatedMinutes, 0)} automated minutes when all scenes succeed.`,
  "",
  ...cueSheet.scenes.flatMap((item) => [
    `## Scene ${item.id} — ${item.title}`,
    `**Camera:** ${item.camera}`,
    `**Client question:** ${item.clientQuestion}`,
    `**Reveal:** ${item.reveal}`,
    `**Live action:** ${item.action}`,
    `**Proof slot:** ${item.proof}`,
    "",
  ]),
].join("\n");

fs.writeFileSync(path.join(outputDir, "cue-sheet.json"), `${JSON.stringify(cueSheet, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, "storyboard.md"), storyboard);

console.log(JSON.stringify({
  status: "ready",
  workflow,
  runId,
  sceneCount: cueSheet.scenes.length,
  cueSheet: path.join(outputDir, "cue-sheet.json"),
  storyboard: path.join(outputDir, "storyboard.md"),
}, null, 2));
