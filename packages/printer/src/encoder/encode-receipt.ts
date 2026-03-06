/// <reference path="../types/receipt-printer-encoder.d.ts" />
import ReceiptPrinterEncoder from "@point-of-sale/receipt-printer-encoder";

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

  const encoderOpts: Record<string, unknown> = { language, columns };
  if (printerModel) {
    encoderOpts.printerModel = printerModel;
  }

  const encoder = new ReceiptPrinterEncoder(encoderOpts);
  const currency = data.meta.currency || "USD";
  const colWidth = columns;
  const separator = "-".repeat(colWidth);

  encoder.initialize().codepage("auto");

  // --- Store header ---
  encoder.align("center").bold(true).line(data.store.name).bold(false);

  if (data.store.address_lines?.length) {
    for (const line of data.store.address_lines) {
      encoder.line(line);
    }
  }
  if (data.store.phone) {
    encoder.line(data.store.phone);
  }
  if (data.store.tax_id) {
    encoder.line(`Tax ID: ${data.store.tax_id}`);
  }

  encoder.newline();
  encoder.align("left");
  encoder.line(separator);

  // --- Order info ---
  encoder.align("center").bold(true).line("SALES RECEIPT").bold(false);
  encoder.align("left");

  const infoColRight = Math.max(12, Math.floor(colWidth / 2));
  const infoColLeft = colWidth - infoColRight;
  const infoCols = [
    { width: infoColLeft, align: "left" as const },
    { width: infoColRight, align: "right" as const },
  ];

  encoder.table(infoCols, [
    ["Receipt #", data.meta.order_number],
    ["Date", data.meta.created_at_gmt],
  ]);

  if (data.cashier?.name) {
    encoder.table(infoCols, [["Cashier", data.cashier.name]]);
  }
  if (data.customer?.name) {
    encoder.table(infoCols, [["Customer", data.customer.name]]);
  }

  encoder.line(separator);

  // --- Line items ---
  const priceColWidth = Math.max(10, Math.floor(colWidth * 0.25));
  const nameColWidth = colWidth - priceColWidth;

  for (const item of data.lines) {
    encoder.line(item.name);
    encoder.table(
      [
        { width: nameColWidth, align: "left" as const },
        { width: priceColWidth, align: "right" as const },
      ],
      [
        [
          `  x${item.qty} @ ${formatMoney(item.unit_price_incl, currency)}`,
          formatMoney(item.line_total_incl, currency),
        ],
      ],
    );
  }

  encoder.line(separator);

  // --- Totals ---
  const totalCols = [
    { width: nameColWidth, align: "left" as const },
    { width: priceColWidth, align: "right" as const },
  ];

  encoder.table(totalCols, [
    ["Subtotal", formatMoney(data.totals.subtotal_incl, currency)],
  ]);

  if (data.totals.discount_total_incl > 0) {
    encoder.table(totalCols, [
      [
        "Discount",
        `-${formatMoney(data.totals.discount_total_incl, currency)}`,
      ],
    ]);
  }

  if (
    data.presentation_hints.display_tax !== "hidden" &&
    data.totals.tax_total > 0
  ) {
    for (const tax of data.tax_summary) {
      const label = tax.rate ? `${tax.label} (${tax.rate}%)` : tax.label;
      encoder.table(totalCols, [
        [label, formatMoney(tax.tax_amount, currency)],
      ]);
    }
  }

  encoder.bold(true);
  encoder.table(totalCols, [
    ["TOTAL", formatMoney(data.totals.grand_total_incl, currency)],
  ]);
  encoder.bold(false);

  encoder.line(separator);

  // --- Payments ---
  for (const payment of data.payments) {
    encoder.table(totalCols, [
      [payment.method_title, formatMoney(payment.amount, currency)],
    ]);

    if (payment.tendered && payment.tendered > 0) {
      encoder.table(totalCols, [
        ["  Tendered", formatMoney(payment.tendered, currency)],
      ]);
      encoder.table(totalCols, [
        ["  Change", formatMoney(payment.change ?? 0, currency)],
      ]);
    }
  }

  encoder.newline();
  encoder.align("center").line("Thank you for your purchase!");
  encoder.newline(2);

  // --- Footer commands ---
  if (openDrawer) {
    encoder.pulse();
  }
  if (cut) {
    encoder.cut("partial");
  }

  return encoder.encode();
}
