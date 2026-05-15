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
export {
	discoverThermalAssetRequests,
	encodeThermalTemplateForPrint,
	isSupportedThermalLogoSrc,
	loadThermalLogoAsset,
	maxDotsForPaperWidth,
	normalizeThermalImageSize,
	prepareThermalPrintAssets,
	renderTemplatePlaceholders,
	renderThermalBarcodeAsset,
} from './thermal-print';
export type {
	EncodeThermalTemplateForPrintInput,
	ThermalAssetRequests,
	ThermalPrintAssets,
} from './thermal-print';
export type {
	RenderForStudioOptions,
	RenderForStudioResult,
	StudioTemplateEngine,
} from './render-for-studio';
export type {
	ReceiptData,
	ReceiptStoreMeta,
	ReceiptCashier,
	ReceiptTaxId,
	ReceiptCustomer,
	ReceiptLineItem,
	ReceiptFee,
	ReceiptShipping,
	ReceiptDiscount,
	ReceiptTotals,
	ReceiptTaxSummaryItem,
	ReceiptPayment,
	ReceiptRefund,
	ReceiptRefundLine,
	ReceiptFiscal,
	ReceiptPresentationHints,
	ReceiptDate,
	ReceiptOrder,
	ReceiptI18n,
	TaxId,
} from './types';
export {
	ReceiptDataSchema,
	ReceiptStoreMetaSchema,
	ReceiptCashierSchema,
	ReceiptTaxIdSchema,
	ReceiptCustomerSchema,
	ReceiptLineItemSchema,
	ReceiptLineItemMetaSchema,
	ReceiptLineItemTaxSchema,
	ReceiptFeeSchema,
	ReceiptShippingSchema,
	ReceiptDiscountSchema,
	ReceiptTotalsSchema,
	ReceiptTaxSummaryItemSchema,
	ReceiptPaymentSchema,
	ReceiptRefundSchema,
	ReceiptRefundLineSchema,
	ReceiptFiscalSchema,
	ReceiptPresentationHintsSchema,
	ReceiptDisplayTaxSchema,
	ReceiptDateSchema,
	ReceiptOrderSchema,
	ReceiptI18nSchema,
} from './schema';
export { buildPreviewTemplateData, renderPreview } from './render-preview';
export type {
	PreviewTemplateEngine,
	RenderPreviewOptions,
	RenderPreviewResult,
} from './render-preview';
