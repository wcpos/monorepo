import { encodeThermalTemplate } from "../renderer";

import { DEFAULT_THERMAL_TEMPLATE } from "./default-thermal-template";
import type { ReceiptData } from "./types";

export interface EncodeReceiptOptions {
  /** Printer model key from receipt-printer-encoder's database */
  printerModel?: string;
  /** Printer command language */
  language?: "esc-pos" | "star-prnt" | "star-line";
  /** Characters per line. 48 = 80mm, 32 = 58mm */
  columns?: number;
  /** Include cut command. Default: true */
  cut?: boolean;
  /** Send cash drawer kick pulse. Default: false */
  openDrawer?: boolean;
}

function formatMoney(value: number, currency: string): string {
  return `${currency} ${value.toFixed(2)}`;
}

export function encodeReceipt(
  data: ReceiptData,
  options: EncodeReceiptOptions = {},
): Uint8Array {
  const {
    printerModel,
    language = "esc-pos",
    columns = 48,
    cut = true,
    openDrawer = false,
  } = options;

  const currency = data.meta.currency;

  // Compute column widths
  const infoColRight = Math.max(12, Math.floor(columns / 2));
  const infoColLeft = columns - infoColRight;
  const priceColWidth = Math.max(10, Math.floor(columns * 0.25));
  const nameColWidth = columns - priceColWidth;

  // Build template data with pre-formatted money values
  const templateData: Record<string, any> = {
    ...data,
    columns,
    cut,
    openDrawer,
    infoColLeft,
    infoColRight,
    nameColWidth,
    priceColWidth,
    order_number: data.meta.order_number,
    created_at_gmt: data.meta.created_at_gmt,
    has_address_lines: data.store.address_lines && data.store.address_lines.length > 0,
    address_lines: (data.store.address_lines ?? []).map((line) => ({ line })),
    has_phone: !!data.store.phone,
    has_tax_id: !!data.store.tax_id,
    cashier_name: data.cashier?.name || "",
    customer_name: data.customer?.name || "",
    formatted_lines: data.lines.map((item) => ({
      name: item.name,
      detail: `  x${item.qty} @ ${formatMoney(item.unit_price_incl, currency)}`,
      line_total_fmt: formatMoney(item.line_total_incl, currency),
      nameColWidth,
      priceColWidth,
    })),
    subtotal_fmt: formatMoney(data.totals.subtotal_incl, currency),
    has_discount: data.totals.discount_total_incl > 0,
    discount_fmt: `-${formatMoney(data.totals.discount_total_incl, currency)}`,
    show_tax: data.presentation_hints.display_tax !== "hidden" && data.totals.tax_total > 0,
    tax_lines: data.tax_summary.map((tax) => ({
      label: tax.rate ? `${tax.label} (${tax.rate}%)` : tax.label,
      amount_fmt: formatMoney(tax.tax_amount, currency),
      nameColWidth,
      priceColWidth,
    })),
    grand_total_fmt: formatMoney(data.totals.grand_total_incl, currency),
    payments: data.payments.map((payment) => ({
      method_title: payment.method_title,
      amount_fmt: formatMoney(payment.amount, currency),
      has_tendered: !!(payment.tendered && payment.tendered > 0),
      tendered_fmt: formatMoney(payment.tendered ?? 0, currency),
      change_fmt: formatMoney(payment.change ?? 0, currency),
      nameColWidth,
      priceColWidth,
    })),
  };

  return encodeThermalTemplate(DEFAULT_THERMAL_TEMPLATE, templateData, {
    printerModel,
    language,
    columns,
  });
}
