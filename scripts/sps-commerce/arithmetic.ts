/**
 * Entity-specific BOL arithmetic calculations.
 * Each Home Depot store has its own cartons-per-pallet rate.
 */

import * as fs from "node:fs";

type Row = Record<string, string>;

export function loadEntityConfig(configPath: string): Record<string, { qty_per_pallet: number }> {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.stores) return parsed.stores;
  } catch {
    // Config not found or invalid, use defaults
  }
  return {};
}

export function extractStoreNumber(name: string): string | null {
  const match = name.match(/#(\d+)/);
  return match ? `#${match[1]}` : null;
}

export function arithmeticRows(rows: Row[], entityConfig: Record<string, { qty_per_pallet: number }>): Row[] {
  return rows.map((row) => {
    const qty = parseInt(row.qty, 10) || 0;
    const pallet = parseInt(row.pallet, 10) || 0;
    const weight = parseInt(row.weight, 10) || 0;
    const storeNum = extractStoreNumber(row.name) || "";
    const rate = entityConfig[storeNum]?.qty_per_pallet || 12;
    const cartonsPerPallet = pallet > 0 ? qty / pallet : 0;
    const weightPerCarton = qty > 0 ? weight / qty : 0;
    const weightPerPallet = pallet > 0 ? weight / pallet : 0;
    const expectedPallets = rate > 0 ? Math.ceil(qty / rate) : pallet;
    const isPartialPallet = qty % rate !== 0;
    const partialCartons = isPartialPallet ? qty % rate : 0;
    return {
      row_id: row.row_id || "",
      store: storeNum,
      entity_rate: String(rate),
      customer_order_pkgs: row.qty,
      handling_unit_pallet_qty: row.pallet,
      package_carton_qty: row.qty,
      grand_total_pallet_qty: row.pallet,
      grand_total_carton_qty: row.qty,
      grand_total_weight_lbs: row.weight,
      cartons_per_pallet: String(cartonsPerPallet.toFixed(2)),
      weight_per_carton_lbs: String(weightPerCarton.toFixed(2)),
      weight_per_pallet_lbs: String(weightPerPallet.toFixed(2)),
      notes: isPartialPallet ? `partial final pallet: ${partialCartons} cartons on last of ${pallet} pallets (${rate}/pallet)` : "even pallet fill",
    };
  });
}

export const ARITHMETIC_HEADERS = [
  "row_id",
  "store",
  "entity_rate",
  "customer_order_pkgs",
  "handling_unit_pallet_qty",
  "package_carton_qty",
  "grand_total_pallet_qty",
  "grand_total_carton_qty",
  "grand_total_weight_lbs",
  "cartons_per_pallet",
  "weight_per_carton_lbs",
  "weight_per_pallet_lbs",
  "notes",
];