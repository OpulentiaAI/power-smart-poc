#!/usr/bin/env node
/**
 * Power Smart POC1 — End-to-End Pipeline Runner
 *
 * Runs the complete workflow:
 * 1. Parse sample order from structured text
 * 2. Validate against retailers and field rules
 * 3. Store durably in Convex
 * 4. Push to Acumatica sandbox
 * 5. Log audit trail
 *
 * Usage: npx tsx scripts/acumatica/pipeline.ts
 */

import { parseStructuredOrder, validateOrder } from "../../lib/power-smart/extraction";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// ─── Sample Data ─────────────────────────────────────────────────────

const SAMPLE_ORDER_TEXT = `Your Name: Jason Mack
Phone: +19053755421
Email: jaysonmon@live.ca
Ordered Platform: Homedepot
Order Number: 840432706992
Ordered Date: 05-11-2026
Product Category: Gas Lawn Mower
Model Number/SKU: DB8721P
Serial Number: 0012412033380609022
Address: 143A Balls Lane Cobourg ON K9A2L4
Purchase Proof:

17785367597992882103857233052183.jpg`;

// ─── Pipeline ────────────────────────────────────────────────────────

interface PipelineResult {
  phase: string;
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
}

const results: PipelineResult[] = [];

function recordResult(
  phase: string,
  success: boolean,
  data?: unknown,
  error?: string
): PipelineResult {
  const r: PipelineResult = {
    phase,
    success,
    data,
    error,
    durationMs: 0,
  };
  results.push(r);
  return r;
}

async function runPipeline(): Promise<void> {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   Power Smart POC1 — End-to-End Pipeline                 ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  // ── Phase 1: Structured Extraction ──────────────────────────────
  console.log("[1/5] Extracting order from structured text...");
  const t1 = Date.now();
  const extraction = parseStructuredOrder(SAMPLE_ORDER_TEXT);
  const r1 = recordResult(
    "extraction",
    extraction.success,
    extraction.data,
    extraction.errors.join("; ")
  );
  r1.durationMs = Date.now() - t1;

  if (!extraction.success || !extraction.data) {
    console.log(`  ✗ FAILED: ${extraction.errors.join(", ")}`);
    printSummary();
    return;
  }
  console.log(`  ✓ Extracted: ${extraction.data.customerName} | Order #${extraction.data.orderNumber}`);
  console.log(`  ✓ Fields: ${Object.keys(extraction.data).length} recognized`);

  // ── Phase 2: Validation ─────────────────────────────────────────
  console.log("\n[2/5] Validating order...");
  const t2 = Date.now();
  const validation = validateOrder(extraction.data);
  const r2 = recordResult("validation", validation.valid, validation.checks);
  r2.durationMs = Date.now() - t2;

  console.log(`  Retailer: ${validation.checks.retailerName} (${validation.checks.retailerRecognized ? "recognized" : "UNKNOWN"})`);
  console.log(`  Email: ${validation.checks.emailValid ? "valid" : "invalid"}`);
  console.log(`  Serial: ${validation.checks.serialNumberValid ? "valid" : "invalid"}`);
  console.log(`  Overall: ${validation.valid ? "✓ PASS" : "✗ FAIL"}`);
  if (validation.notes.length > 0) {
    validation.notes.forEach((n) => console.log(`  Note: ${n}`));
  }

  // ── Phase 3: Prepare JSON payloads ──────────────────────────────
  console.log("\n[3/5] Preparing Acumatica payloads...");
  const t3 = Date.now();

  const orderInput = {
    customerName: extraction.data.customerName,
    phone: extraction.data.phone,
    email: extraction.data.email,
    address: extraction.data.address,
    platform: extraction.data.platform,
    orderNumber: extraction.data.orderNumber,
    orderedDate: extraction.data.orderedDate,
    productCategory: extraction.data.productCategory,
    modelSku: extraction.data.modelSku,
    serialNumber: extraction.data.serialNumber,
  };

  const warrantyInput = {
    claimantName: extraction.data.customerName,
    phone: extraction.data.phone,
    email: extraction.data.email,
    address: extraction.data.address,
    productCategory: extraction.data.productCategory,
    modelSku: extraction.data.modelSku,
    serialNumber: extraction.data.serialNumber,
    platform: extraction.data.platform,
    orderNumber: extraction.data.orderNumber,
    purchaseDate: extraction.data.orderedDate,
    validationResult: validation.valid ? "validated" : "escalated",
    validationNotes: validation.notes.join("; ") || "All checks passed",
  };

  const combinedPayload = { order: orderInput, warranty: warrantyInput };
  const repoRoot = path.resolve(import.meta.dirname, "../..");
  const artifactsDir = path.join(repoRoot, "artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });
  const payloadPath = path.join(artifactsDir, "acumatica-payload.json");
  fs.writeFileSync(payloadPath, JSON.stringify(combinedPayload, null, 2));
  const r3 = recordResult("prepare_payloads", true, { payloadPath });
  r3.durationMs = Date.now() - t3;
  console.log(`  ✓ Payloads written to artifacts/acumatica-payload.json`);

  // ── Phase 4: Push to Acumatica ──────────────────────────────────
  console.log("\n[4/5] Pushing to Acumatica...");
  const t4 = Date.now();

  try {
    const pushResult = execSync(
      `cat "${payloadPath}" | npm run acumatica -- push-both`,
      {
        encoding: "utf-8",
        timeout: 60000,
        env: { ...process.env, HOME: process.env.HOME || "/root" },
        cwd: repoRoot,
      }
    );
    console.log(pushResult);
    const r4 = recordResult("push_to_acumatica", true, { raw: pushResult });
    r4.durationMs = Date.now() - t4;
  } catch (err: any) {
    const errorMsg = err.stderr || err.message || "Unknown error";
    const r4 = recordResult("push_to_acumatica", false, undefined, errorMsg);
    r4.durationMs = Date.now() - t4;

    if (errorMsg.includes("Config file not found")) {
      console.log("  ⚠ Acumatica config not set. Skipping push.");
      console.log("  → Run: npx tsx scripts/acumatica/cli.ts config --set");
    } else {
      console.log(`  ✗ Acumatica push failed: ${errorMsg.substring(0, 200)}`);
    }
  }

  // ── Phase 5: Summary ────────────────────────────────────────────
  console.log("\n[5/5] Pipeline complete.");
  printSummary();
}

function printSummary(): void {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║   Pipeline Summary                                       ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  for (const r of results) {
    const icon = r.success ? "✓" : "✗";
    console.log(`  ${icon} ${r.phase.padEnd(25)} ${r.durationMs}ms`);
    if (r.error) {
      console.log(`    Error: ${r.error}`);
    }
  }

  // Write results for audit
  const repoRoot = path.resolve(import.meta.dirname, "../..");
  const resultsPath = path.join(repoRoot, "artifacts", "pipeline-results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nFull results: ${resultsPath}`);
}

runPipeline().catch((err) => {
  console.error("Pipeline failed:", err.message);
  process.exit(1);
});
