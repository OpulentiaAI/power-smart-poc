#!/usr/bin/env node
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const skillPath = path.join(repoRoot, ".agents/skills/power-smart-illustrated-demo/SKILL.md");
const skill = fs.readFileSync(skillPath, "utf8");
const failures: string[] = [];

for (const required of [
  "not a second automation engine",
  "production skills remain authoritative",
  "browser_manage",
  "computer_manage",
  "run_command",
  "document_manage",
  "evidence ribbon",
  "source → decision → destination",
  "real credentials",
]) {
  if (!skill.toLowerCase().includes(required.toLowerCase())) {
    failures.push(`illustrated-demo skill is missing ${JSON.stringify(required)}`);
  }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "power-smart-demo-"));

try {
  for (const workflow of ["order", "warranty", "sps-bol"]) {
    const runId = `verify-${workflow}`;
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/illustrated-demo/cue-sheet.ts",
        "--workflow",
        workflow,
        "--run-id",
        runId,
        "--out",
        tempRoot,
      ],
      { cwd: repoRoot, stdio: "pipe" },
    );

    const cuePath = path.join(tempRoot, runId, "cue-sheet.json");
    const storyboardPath = path.join(tempRoot, runId, "storyboard.md");
    const cue = JSON.parse(fs.readFileSync(cuePath, "utf8")) as {
      mode: string;
      productionSemantics: string;
      scenes: Array<{ camera: string; clientQuestion: string; proof: string }>;
    };

    if (cue.mode !== "illustration" || cue.productionSemantics !== "unchanged") {
      failures.push(`${workflow} cue sheet does not preserve production semantics`);
    }
    if (cue.scenes.length < 5 || !fs.existsSync(storyboardPath)) {
      failures.push(`${workflow} cue sheet is incomplete`);
    }
    if (cue.scenes.some((scene) => !scene.clientQuestion || !scene.proof)) {
      failures.push(`${workflow} has a scene without a question or proof slot`);
    }
  }
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`✗ ${failure}`));
  process.exit(1);
}

console.log("✓ Illustrated demo is opt-in and preserves production semantics");
console.log("✓ Order, warranty, and SPS BOL cue sheets are complete");
