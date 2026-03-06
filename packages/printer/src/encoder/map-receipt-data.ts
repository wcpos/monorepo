/**
 * Maps receipt data from the offline rendering shape (produced by buildReceiptData
 * in the core package) to the canonical ReceiptData shape expected by encodeReceipt.
 *
 * The offline rendering system builds a simplified, Mustache-friendly structure
 * from RxDB documents. This mapper bridges that gap so the printer encoder can
 * accept either shape without modification.
 *
 * Defensive throughout — missing fields, wrong types, and nulls are all handled
 * with sensible defaults so the encoder never blows up on bad input.
 */

import type {
  ReceiptCashier,
  ReceiptCustomer,
  ReceiptData,
  ReceiptDiscount,
  ReceiptFee,
  ReceiptFiscal,
  ReceiptLineItem,
  ReceiptOrderMeta,
  ReceiptPayment,
  ReceiptPresentationHints,
  ReceiptStoreMeta,
  ReceiptTaxSummaryItem,
  ReceiptTotals,
} from "./types";

/** Safe number coercion — handles strings, nulls, undefined, NaN. */
function toNum(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Safe string coercion. */
function toStr(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

/** Safe array coercion. */
function toArr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Checks whether the data already matches the canonical ReceiptData shape.
 * We look for fields that exist only in the canonical shape and never in the
 * offline rendering shape (e.g., `meta.schema_version`, `meta.order_id`,
 * `totals.subtotal_incl`).
 */
function isCanonicalShape(data: Record<string, any>): boolean {
  const meta = data.meta;
  const totals = data.totals;

  // Require markers from at least two sections to avoid false positives
  const hasMeta =
    meta &&
    typeof meta === "object" &&
    "schema_version" in meta &&
    "order_id" in meta;
  const hasTotals =
    totals && typeof totals === "object" && "subtotal_incl" in totals;

  return !!(hasMeta && hasTotals);
}

function mapMeta(src: Record<string, any>): ReceiptOrderMeta {
  return {
    schema_version: 1,
    mode: toStr(src.status) || "live",
    created_at_gmt: toStr(src.order_date),
    order_id: 0, // Not available in the offline shape
    order_number: toStr(src.order_number),
    currency: toStr(src.currency),
  };
}

function mapStore(src: Record<string, any>): ReceiptStoreMeta {
  // The offline shape has a single `address` string. Split on commas
  // to produce address_lines for the encoder.
  const rawAddress = toStr(src.address);
  const addressLines = rawAddress
    ? rawAddress
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
    : [];

  return {
    name: toStr(src.name),
    address_lines: addressLines,
    phone: toStr(src.phone),
    email: toStr(src.email),
  };
}

function mapCustomer(src: Record<string, any>): ReceiptCustomer {
  // The offline shape stores addresses as formatted strings, not objects.
  // We can't reverse-parse them reliably, so leave the record-based fields empty.
  return {
    id: 0,
    name: toStr(src.name),
    billing_address: {},
    shipping_address: {},
  };
}

function mapLine(src: Record<string, any>, index: number): ReceiptLineItem {
  const qty = toNum(src.quantity);
  const price = toNum(src.price);
  const total = toNum(src.total);
  const unitPrice = qty > 0 ? total / qty : price;

  return {
    key:
      toStr(src.key) ||
      toStr(src.sku) ||
      `line-${index}-${toStr(src.name).slice(0, 20)}`,
    sku: toStr(src.sku),
    name: toStr(src.name),
    qty,
    unit_price_incl: unitPrice,
    unit_price_excl: unitPrice,
    line_subtotal_incl: total,
    line_subtotal_excl: total,
    discounts_incl: 0,
    discounts_excl: 0,
    line_total_incl: total,
    line_total_excl: total,
    taxes: [],
  };
}

function mapTotals(src: Record<string, any>): ReceiptTotals {
  const subtotal = toNum(src.subtotal);
  const taxTotal = toNum(src.tax_total);
  const discountTotal = toNum(src.discount_total);
  const grandTotalIncl = toNum(src.grand_total_incl);

  return {
    subtotal_incl: subtotal,
    subtotal_excl: subtotal - taxTotal,
    discount_total_incl: discountTotal,
    discount_total_excl: discountTotal,
    tax_total: taxTotal,
    grand_total_incl: grandTotalIncl,
    grand_total_excl: grandTotalIncl - taxTotal,
    paid_total: grandTotalIncl,
    change_total: 0,
  };
}

function mapPayment(src: Record<string, any>): ReceiptPayment {
  return {
    method_id: toStr(src.method),
    method_title: toStr(src.method),
    amount: toNum(src.amount),
    reference: toStr(src.transaction_id),
  };
}

function mapFiscal(src: Record<string, any>): ReceiptFiscal {
  return {
    immutable_id: toStr(src.fiscal_id) || undefined,
  };
}

/**
 * Convert receipt data from the offline rendering shape to the canonical
 * ReceiptData shape used by the printer encoder.
 *
 * If the data already matches the canonical shape, it is returned as-is
 * (cast to ReceiptData). This makes it safe to always run incoming data
 * through the mapper regardless of its origin.
 */
export function mapReceiptData(data: Record<string, any>): ReceiptData {
  if (!data || typeof data !== "object") {
    // Return a minimal valid structure so the encoder doesn't crash.
    return emptyReceiptData();
  }

  // Pass through data that already matches the canonical shape.
  if (isCanonicalShape(data)) {
    return data as ReceiptData;
  }

  const meta = data.meta && typeof data.meta === "object" ? data.meta : {};
  const store = data.store && typeof data.store === "object" ? data.store : {};
  const customer =
    data.customer && typeof data.customer === "object" ? data.customer : {};
  const totals =
    data.totals && typeof data.totals === "object" ? data.totals : {};
  const fiscal =
    data.fiscal && typeof data.fiscal === "object" ? data.fiscal : {};

  return {
    meta: mapMeta(meta),
    store: mapStore(store),
    cashier: { id: 0, name: "" } as ReceiptCashier,
    customer: mapCustomer(customer),
    lines: toArr(data.lines).map((item, i) =>
      mapLine(
        item && typeof item === "object" ? (item as Record<string, any>) : {},
        i,
      ),
    ),
    fees: [] as ReceiptFee[],
    shipping: [] as ReceiptFee[],
    discounts: [] as ReceiptDiscount[],
    totals: mapTotals(totals),
    tax_summary: [] as ReceiptTaxSummaryItem[],
    payments: toArr(data.payments).map((p) =>
      mapPayment(p && typeof p === "object" ? (p as Record<string, any>) : {}),
    ),
    fiscal: mapFiscal(fiscal),
    presentation_hints: {
      display_tax: "incl",
      prices_entered_with_tax: true,
      rounding_mode: "round",
      locale: "en-US",
    } as ReceiptPresentationHints,
  };
}

/** Minimal valid ReceiptData with all required fields set to defaults. */
function emptyReceiptData(): ReceiptData {
  return {
    meta: {
      schema_version: 1,
      mode: "live",
      created_at_gmt: "",
      order_id: 0,
      order_number: "",
      currency: "",
    },
    store: { name: "", address_lines: [] },
    cashier: { id: 0, name: "" },
    customer: { id: 0, name: "" },
    lines: [],
    fees: [],
    shipping: [],
    discounts: [],
    totals: {
      subtotal_incl: 0,
      subtotal_excl: 0,
      discount_total_incl: 0,
      discount_total_excl: 0,
      tax_total: 0,
      grand_total_incl: 0,
      grand_total_excl: 0,
      paid_total: 0,
      change_total: 0,
    },
    tax_summary: [],
    payments: [],
    fiscal: {},
    presentation_hints: {
      display_tax: "incl",
      prices_entered_with_tax: true,
      rounding_mode: "round",
      locale: "en-US",
    },
  };
}
