#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

const skillPaths = [
  ".agents/skills/power-smart-show-your-work/SKILL.md",
  ".agents/skills/power-smart-order-intake/SKILL.md",
  ".agents/skills/power-smart-warranty-intake/SKILL.md",
  ".agents/skills/power-smart-sps-bol/SKILL.md",
] as const;

const contents = new Map(
  skillPaths.map((relativePath) => [
    relativePath,
    fs.readFileSync(path.join(repoRoot, relativePath), "utf8"),
  ]),
);

const shared = contents.get(skillPaths[0])!;
const failures: string[] = [];

function requireText(label: string, content: string, expected: string): void {
  if (!content.includes(expected)) {
    failures.push(`${label} is missing ${JSON.stringify(expected)}`);
  }
}

for (const tool of ["browser_manage", "computer_manage", "run_command"]) {
  requireText("shared visual contract", shared, tool);
}

for (const rule of [
  "look, act, prove",
  "provider: \"cua-daytona\"",
  "Do not use hidden HTTP calls",
  "sending, when authorized",
  "fresh visual proof for every milestone",
]) {
  requireText("shared visual contract", shared, rule);
}

for (const [relativePath, content] of contents) {
  if (relativePath === skillPaths[0]) continue;
  for (const tool of ["browser_manage", "computer_manage", "run_command"]) {
    requireText(relativePath, content, tool);
  }
}

requireText("order intake", contents.get(skillPaths[1])!, "duplicate lookup");
requireText("order intake", contents.get(skillPaths[1])!, "--prepare-only");
requireText("warranty intake", contents.get(skillPaths[2])!, "webmail");
requireText("warranty intake", contents.get(skillPaths[2])!, "appears in Sent");
requireText("warranty intake", contents.get(skillPaths[2])!, "--prepare-only");
requireText("SPS BOL", contents.get(skillPaths[3])!, "LibreOffice");
requireText("SPS BOL", contents.get(skillPaths[3])!, "01_sps_export_raw.csv");
requireText("SPS BOL", contents.get(skillPaths[3])!, "03_normalized_orders.csv");

if (failures.length > 0) {
  for (const failure of failures) console.error(`✗ ${failure}`);
  process.exit(1);
}

console.log("✓ Power Smart visual workflow contract is complete");
console.log(`✓ ${skillPaths.length} workflow skills use browser, computer, and CLI lanes`);
