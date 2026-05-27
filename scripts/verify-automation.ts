#!/usr/bin/env node
/**
 * Power Smart POC — automation verification (structure + golden artifacts).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `: ${detail}` : ""}`);
  if (ok) passed++;
  else failed++;
}

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(repoRoot, rel));
}

function run(cmd: string): string {
  return execSync(cmd, { cwd: repoRoot, encoding: "utf8", timeout: 120000 }).trim();
}

// Structure
for (const f of [
  "scripts/acumatica/cli.ts",
  "scripts/sps-commerce/cli.ts",
  "lib/power-smart/extraction.ts",
  "skills/power-smart-order-intake/SKILL.md",
  "skills/power-smart-warranty-intake/SKILL.md",
  "skills/power-smart-sps-bol/SKILL.md",
]) {
  check(`file ${f}`, fileExists(f));
}

// Extraction smoke
try {
  const out = run(
    "npx tsx scripts/verify-extraction-smoke.ts",
  );
  const parsed = JSON.parse(out);
  check("extraction + validation", parsed.ok === true, parsed.order);
} catch (e: unknown) {
  check("extraction + validation", false, String(e));
}

// SPS golden artifacts (from bol_automation_outputs or prior run)
const spsDir = path.join(repoRoot, "artifacts/sps-bol-run");
const spsFiles = [
  "01_sps_export_raw.csv",
  "06_validation_report.csv",
  "07_output_manifest.csv",
  "automation_summary.json",
];
for (const f of spsFiles) {
  check(`SPS artifact ${f}`, fs.existsSync(path.join(spsDir, f)));
}

// CLI help smoke
try {
  run("npm run acumatica -- 2>&1 | head -1");
  check("acumatica CLI", true);
} catch {
  check("acumatica CLI", false);
}
try {
  run("npm run sps-bol -- 2>&1 | head -1");
  check("sps-bol CLI", true);
} catch {
  check("sps-bol CLI", false);
}

// Acumatica config (optional — warn only)
const cfgPath = path.join(process.env.HOME || "", ".acumatica-config.json");
check("acumatica config present", fs.existsSync(cfgPath), cfgPath || "missing");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
