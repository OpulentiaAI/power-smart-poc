#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import JSZip from "jszip";
import XLSX from "xlsx";

type Row = Record<string, string>;

const RAW_HEADERS = [
  "Name",
  "Address 1",
  "Address 2",
  "City",
  "State",
  "Zip",
  "SHPTO_COUNTRY_ID",
  "Phone",
  "Model",
  "PO",
  "QTY",
  "Weight",
  "Shipping Message",
  "Carrier",
  "BOL Number",
  "Customer Order No",
  "Pallet",
];

const NORMALIZED_HEADERS = [
  "name",
  "address_1",
  "address_2",
  "city",
  "state",
  "zip",
  "shpto_country_id",
  "phone",
  "model",
  "po",
  "qty",
  "weight",
  "shipping_message",
  "carrier",
  "bol_number",
  "customer_order_no",
  "pallet",
];

const REQUIRED_FIELDS = [
  "name",
  "address_1",
  "city",
  "state",
  "zip",
  "po",
  "qty",
  "weight",
  "carrier",
  "bol_number",
];

const FIELD_MAPPING = [
  ["«Name»", "name", "Ship-to customer or store name", "required"],
  ["«Address_1»", "address_1", "Ship-to street address line 1", "required"],
  ["«Address_2»", "address_2", "Ship-to street address line 2", "optional"],
  ["«City»", "city", "Ship-to city", "required"],
  ["«State»", "state", "Ship-to state abbreviation", "required"],
  ["«Zip»", "zip", "Ship-to ZIP, preserved with leading zeros", "required"],
  ["«Phone»", "phone", "Ship-to phone", "optional"],
  ["«PO_»", "po", "Customer purchase order", "required"],
  ["«QTY»", "qty", "Carton/package quantity", "required"],
  ["«Weight»", "weight", "Shipment weight", "required"],
  ["«Shipping_Message»", "shipping_message", "Special instructions", "optional"],
  ["«Carrier»", "carrier", "Carrier name", "required"],
  ["«BOL_Number»", "bol_number", "Bill of lading/SID number", "required"],
  ["«Customer_Order_No»", "customer_order_no", "Additional shipper info", "optional"],
  ["«Pallet»", "pallet", "Pallet count", "optional"],
  ["«Model»", "model", "Commodity model text", "optional"],
];

function usage(): void {
  console.log(`Power Smart SPS Commerce CLI

USAGE:
  npm run sps-bol -- generate --source <xlsx> --template <docx> --out <dir>

COMMANDS:
  generate   Normalize SPS export rows, validate required BOL fields, and generate DOCX BOLs.
`);
}

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return String(value).trim();
}

function normalizeZip(value: unknown): string {
  let text = cellText(value);
  if (!text) return "";
  if (/^\d+(\.0)?$/.test(text)) text = text.split(".")[0] || text;
  return /^\d+$/.test(text) && text.length < 5 ? text.padStart(5, "0") : text;
}

function safeFilename(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "bol";
}

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function writeCsv(filePath: string, rows: Row[], headers: string[]): void {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header] || "")).join(","));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function loadSheetRows(workbook: XLSX.WorkBook, sheetName: string): Row[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Missing worksheet: ${sheetName}`);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  return rows
    .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim(), cellText(value)])))
    .filter((row) => Object.values(row).some(Boolean));
}

function normalizeOrders(rawRows: Row[]): Row[] {
  return rawRows.map((raw) => {
    const row: Row = {};
    RAW_HEADERS.forEach((rawHeader, index) => {
      const normalizedHeader = NORMALIZED_HEADERS[index]!;
      const value = raw[rawHeader] || "";
      row[normalizedHeader] = normalizedHeader === "zip" ? normalizeZip(value) : cellText(value);
    });
    return row;
  });
}

function validationRows(rows: Row[]): Row[] {
  return rows.map((row, index) => {
    const missing = REQUIRED_FIELDS.filter((field) => !row[field]);
    return {
      row_id: String(index + 1),
      bol_number: row.bol_number || "",
      po: row.po || "",
      status: missing.length === 0 ? "valid" : "invalid",
      missing_required_fields: missing.join("; "),
      notes: missing.length === 0 ? "" : "Missing fields must be corrected before BOL generation.",
    };
  });
}

function payloadRows(rows: Row[], validations: Row[]): Row[] {
  const validIds = new Set(validations.filter((row) => row.status === "valid").map((row) => row.row_id));
  return rows.flatMap((row, index) => {
    const rowId = String(index + 1);
    if (!validIds.has(rowId)) return [];
    return [{
      row_id: rowId,
      Name: row.name || "",
      Address_1: row.address_1 || "",
      Address_2: row.address_2 || "",
      City: row.city || "",
      State: row.state || "",
      Zip: row.zip || "",
      Phone: row.phone || "",
      PO_: row.po || "",
      QTY: row.qty || "",
      Weight: row.weight || "",
      Shipping_Message: row.shipping_message || "",
      Carrier: row.carrier || "",
      BOL_Number: row.bol_number || "",
      Customer_Order_No: row.customer_order_no || "",
      Pallet: row.pallet || "",
      Model: row.model || "",
    }];
  });
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function replaceMergeField(xml: string, fieldName: string, value: string): string {
  const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<w:fldSimple w:instr=" MERGEFIELD\\s+${escapedField}\\s+">.*?</w:fldSimple>`, "gs");
  return xml.replace(pattern, `<w:r><w:t xml:space="preserve">${xmlEscape(value)}</w:t></w:r>`);
}

function replaceSplitModelPlaceholder(xml: string, value: string): string {
  return xml.replace(/«<\/w:t>.*?<w:t>Model<\/w:t>.*?<w:t>»/gs, xmlEscape(value));
}

function stripFieldInstructions(xml: string): string {
  return xml.replace(/<w:instrText[^>]*>\s*MERGEFIELD[^<]*<\/w:instrText>/g, "<w:t></w:t>");
}

async function patchTemplateDocument(templatePath: string, payload: Row, outputPath: string): Promise<void> {
  const zip = await JSZip.loadAsync(fs.readFileSync(templatePath));
  const document = zip.file("word/document.xml");
  if (!document) throw new Error("Template is missing word/document.xml");
  let xml = await document.async("string");
  for (const [key, value] of Object.entries(payload)) {
    if (key === "row_id") continue;
    xml = replaceMergeField(xml, key, value);
    xml = xml.replaceAll(`«${key}»`, xmlEscape(value));
  }
  xml = replaceSplitModelPlaceholder(xml, payload.Model || "");
  xml = stripFieldInstructions(xml);
  zip.file("word/document.xml", xml);
  const content = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(outputPath, content);
}

async function docxXml(docxPath: string): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(docxPath));
  const document = zip.file("word/document.xml");
  if (!document) throw new Error(`DOCX is missing word/document.xml: ${docxPath}`);
  return document.async("string");
}

async function unreplacedPlaceholders(docxPath: string): Promise<string[]> {
  const xml = await docxXml(docxPath);
  return [...new Set(xml.match(/«[^»]+»/g) || [])].filter((item) => !item.includes("<")).sort();
}

async function docxTextPreview(docxPath: string): Promise<string> {
  const xml = await docxXml(docxPath);
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tc>/g, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

async function generateBols(templatePath: string, outDir: string, payload: Row[]): Promise<{ manifest: Row[]; qa: Row[] }> {
  const bolDir = path.join(outDir, "generated_bols");
  const previewDir = path.join(outDir, "previews");
  fs.rmSync(bolDir, { recursive: true, force: true });
  fs.rmSync(previewDir, { recursive: true, force: true });
  fs.mkdirSync(bolDir, { recursive: true });
  fs.mkdirSync(previewDir, { recursive: true });

  const manifest: Row[] = [];
  const qa: Row[] = [];
  for (const row of payload) {
    const filename = `${safeFilename(row.BOL_Number)}_${safeFilename(row.PO_)}.docx`;
    const outputDocx = path.join(bolDir, filename);
    await patchTemplateDocument(templatePath, row, outputDocx);
    const placeholders = await unreplacedPlaceholders(outputDocx);
    const previewText = path.join(previewDir, `${path.parse(filename).name}.txt`);
    fs.writeFileSync(previewText, await docxTextPreview(outputDocx), "utf8");
    manifest.push({
      row_id: row.row_id,
      bol_number: row.BOL_Number,
      po: row.PO_,
      output_docx: outputDocx,
      preview_text: previewText,
      status: placeholders.length === 0 ? "generated" : "needs_review",
    });
    qa.push({
      output_docx: outputDocx,
      unreplaced_placeholders: placeholders.join("; "),
      structural_preview: previewText,
      render_status: "not_rendered",
    });
  }

  return { manifest, qa };
}

async function generate(args: string[]): Promise<void> {
  const source = argValue(args, "--source");
  const template = argValue(args, "--template");
  const outDir = argValue(args, "--out");
  if (!source || !template || !outDir) {
    usage();
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const workbook = XLSX.readFile(source, { cellDates: false });
  const rawRows = loadSheetRows(workbook, "Sheet1");
  const destinationRows = loadSheetRows(workbook, "Sheet2");
  const normalized = normalizeOrders(rawRows);
  const validations = validationRows(normalized);
  const payload = payloadRows(normalized, validations);
  const { manifest, qa } = await generateBols(template, outDir, payload);

  writeCsv(path.join(outDir, "01_sps_export_raw.csv"), rawRows, RAW_HEADERS);
  writeCsv(path.join(outDir, "02_destination_reference.csv"), destinationRows, ["Name", "Address 1", "Address 2", "City", "State", "Zip"]);
  writeCsv(path.join(outDir, "03_normalized_orders.csv"), normalized, NORMALIZED_HEADERS);
  writeCsv(
    path.join(outDir, "04_bol_field_mapping.csv"),
    FIELD_MAPPING.map(([template_placeholder, payload_field, description, requirement]) => ({
      template_placeholder,
      payload_field,
      description,
      requirement,
    })),
    ["template_placeholder", "payload_field", "description", "requirement"],
  );
  writeCsv(path.join(outDir, "05_bol_payload.csv"), payload, [
    "row_id",
    "Name",
    "Address_1",
    "Address_2",
    "City",
    "State",
    "Zip",
    "Phone",
    "PO_",
    "QTY",
    "Weight",
    "Shipping_Message",
    "Carrier",
    "BOL_Number",
    "Customer_Order_No",
    "Pallet",
    "Model",
  ]);
  writeCsv(path.join(outDir, "06_validation_report.csv"), validations, ["row_id", "bol_number", "po", "status", "missing_required_fields", "notes"]);
  writeCsv(path.join(outDir, "07_output_manifest.csv"), manifest, ["row_id", "bol_number", "po", "output_docx", "preview_text", "status"]);
  writeCsv(path.join(outDir, "08_docx_qa_report.csv"), qa, ["output_docx", "unreplaced_placeholders", "structural_preview", "render_status"]);

  const validationStatuses = validations.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const summary = {
    status: "completed",
    source_xlsx: source,
    template_docx: template,
    output_dir: outDir,
    raw_order_rows: rawRows.length,
    destination_reference_rows: destinationRows.length,
    normalized_order_rows: normalized.length,
    valid_payload_rows: payload.length,
    generated_bol_docs: manifest.length,
    validation_statuses: validationStatuses,
    manifest: path.join(outDir, "07_output_manifest.csv"),
  };
  fs.writeFileSync(path.join(outDir, "automation_summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "generate":
      return generate(args);
    default:
      usage();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "error", error: error.message }, null, 2));
  process.exit(1);
});
