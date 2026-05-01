/**
 * Browser-safe entry point exposing the receipt-data contract and the
 * pipeline-parity render helper. Used by `@wcpos/template-studio` so it can
 * pull in the schema + render path without dragging in the React Native
 * printer-service / discovery code that lives at the package root.
 */

export { encodeReceipt } from './encode-receipt';
export type { EncodeReceiptOptions } from './encode-receipt';
export { formatReceiptData } from './format-receipt-data';
export { mapReceiptData } from './map-receipt-data';
export { renderForStudio, buildTemplateData } from './render-for-studio';
export type {
	RenderForStudioOptions,
	RenderForStudioResult,
	StudioTemplateEngine,
} from './render-for-studio';
export type {
	ReceiptData,
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
} from './types';
export {
	ReceiptDataSchema,
	ReceiptStoreMetaSchema,
	ReceiptOrderMetaSchema,
	ReceiptCashierSchema,
	ReceiptCustomerSchema,
	ReceiptLineItemSchema,
	ReceiptLineItemMetaSchema,
	ReceiptLineItemTaxSchema,
	ReceiptFeeSchema,
	ReceiptDiscountSchema,
	ReceiptTotalsSchema,
	ReceiptTaxSummaryItemSchema,
	ReceiptPaymentSchema,
	ReceiptFiscalSchema,
	ReceiptPresentationHintsSchema,
	ReceiptDisplayTaxSchema,
	ReceiptDateSchema,
	ReceiptInfoSchema,
	ReceiptOrderSchema,
	ReceiptI18nSchema,
} from './schema';
