/**
 * Canonical receipt data types.
 *
 * These types are derived from the Zod schemas in `./schema.ts`, which is the
 * single source of truth. This file is a thin re-export kept for compatibility
 * with existing imports of `ReceiptData`, `ReceiptStoreMeta`, etc.
 */

export type {
	ReceiptStoreMeta,
	ReceiptOrderMeta,
	ReceiptCashier,
	ReceiptCustomer,
	ReceiptLineItem,
	ReceiptFee,
	ReceiptDiscount,
	ReceiptTotals,
	ReceiptTaxSummaryItem,
	ReceiptPayment,
	ReceiptFiscal,
	ReceiptPresentationHints,
	ReceiptDate,
	ReceiptInfo,
	ReceiptOrder,
	ReceiptI18n,
	ReceiptData,
} from './schema';
