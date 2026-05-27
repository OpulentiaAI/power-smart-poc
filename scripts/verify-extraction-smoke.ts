import * as fs from "node:fs";
import { parseStructuredOrder, validateOrder } from "../lib/power-smart/extraction.ts";

const text = fs.readFileSync("fixtures/sample-order-intake.txt", "utf8");
const extracted = parseStructuredOrder(text);
const validated = validateOrder(extracted.data!);
console.log(
  JSON.stringify({
    ok: extracted.success && validated.valid,
    order: extracted.data?.orderNumber,
  }),
);
