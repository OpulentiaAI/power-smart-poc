#!/usr/bin/env node
import { randomInt } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseStructuredOrder, validateOrder } from "../../lib/power-smart/extraction.ts";

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function uniqueDigits(length: number): string {
  const timestamp = Date.now().toString();
  const random = randomInt(0, 100000).toString().padStart(5, "0");
  return `9${timestamp}${random}`.padEnd(length, "7").slice(0, length);
}

const args = process.argv.slice(2);
const inputPath = argValue(args, "--input");
const runId = argValue(args, "--run-id");
const unique = args.includes("--unique");

if (!inputPath || !runId) {
  console.error("Usage: npm run demo:payload -- --input <intake.txt> --run-id <slug> [--unique]");
  process.exit(1);
}

const absoluteInput = path.resolve(inputPath);
if (!fs.existsSync(absoluteInput)) {
  console.error(`Intake not found: ${absoluteInput}`);
  process.exit(1);
}

const extraction = parseStructuredOrder(fs.readFileSync(absoluteInput, "utf8"));
if (!extraction.success || !extraction.data) {
  console.error(`Extraction failed: ${extraction.errors.join("; ")}`);
  process.exit(1);
}

const validation = validateOrder(extraction.data);
if (!validation.valid) {
  console.error(`Validation failed: ${validation.notes.join("; ")}`);
  process.exit(1);
}

const orderNumber = argValue(args, "--order-number")
  ?? (unique ? uniqueDigits(12) : extraction.data.orderNumber);
const serialNumber = argValue(args, "--serial-number")
  ?? (unique ? uniqueDigits(19) : extraction.data.serialNumber);
const label = argValue(args, "--label")
  ?? (unique ? `${extraction.data.customerName} — Illustrated Demo` : extraction.data.customerName);

const order = {
  customerName: label,
  phone: extraction.data.phone,
  email: extraction.data.email,
  address: extraction.data.address,
  platform: extraction.data.platform,
  orderNumber,
  orderedDate: extraction.data.orderedDate,
  productCategory: extraction.data.productCategory,
  modelSku: extraction.data.modelSku,
  serialNumber,
};

const warranty = {
  claimantName: label,
  phone: extraction.data.phone,
  email: extraction.data.email,
  address: extraction.data.address,
  productCategory: extraction.data.productCategory,
  modelSku: extraction.data.modelSku,
  serialNumber,
  platform: extraction.data.platform,
  orderNumber,
  purchaseDate: extraction.data.orderedDate,
  validationResult: "validated",
  validationNotes: unique
    ? "Validated rehearsal clone with unique identifiers"
    : validation.notes.join("; ") || "All checks passed",
};

const outputDir = path.resolve(argValue(args, "--out") ?? "artifacts/illustrated-demo", runId);
fs.mkdirSync(outputDir, { recursive: true });
fs.copyFileSync(absoluteInput, path.join(outputDir, "intake.txt"));
fs.writeFileSync(path.join(outputDir, "order.json"), `${JSON.stringify(order, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, "warranty.json"), `${JSON.stringify(warranty, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, "payload.json"), `${JSON.stringify({ order, warranty }, null, 2)}\n`);

console.log(JSON.stringify({
  status: "prepared",
  runId,
  unique,
  orderNumber,
  serialNumber,
  customerName: label,
  outputDir,
  order: path.join(outputDir, "order.json"),
  warranty: path.join(outputDir, "warranty.json"),
  payload: path.join(outputDir, "payload.json"),
}, null, 2));
