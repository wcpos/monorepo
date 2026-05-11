export { encodeReceipt } from './encoder/encode-receipt';
export type { EncodeReceiptOptions } from './encoder/encode-receipt';
export { formatReceiptData } from './encoder/format-receipt-data';
export { mapReceiptData } from './encoder/map-receipt-data';
export { renderForStudio, buildTemplateData } from './encoder/render-for-studio';
export type {
	RenderForStudioOptions,
	RenderForStudioResult,
	StudioTemplateEngine,
} from './encoder/render-for-studio';
export type {
	ReceiptData,
	ReceiptStoreMeta,
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
	ReceiptOrder,
} from './encoder/types';
export {
	ReceiptDataSchema,
	ReceiptStoreMetaSchema,
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
	ReceiptOrderSchema,
} from './encoder/schema';
export {
	renderThermalPreview,
	encodeThermalTemplate,
	parseXml,
	renderHtml,
	renderEscpos,
} from './renderer';
export type { EscposRenderOptions } from './renderer';
export { PrinterService } from './printer-service';
export { usePrint } from './hooks/use-print';
export { usePrinterDiscovery } from './hooks/use-printer-discovery';
export { resolvePrinter } from './resolve-printer';
export type { TemplateInfo, ResolvePrinterOptions } from './resolve-printer';
export { detectMismatch } from './detect-mismatch';
export { probeVendor } from './utils/probe-vendor';
export type {
	PrinterTransport,
	PrinterProfile,
	DiscoveredPrinter,
	PrintJob,
	UsePrintResult,
} from './types';
export { buildPrintableReceiptHtml, normalizeReceiptPaperWidth } from './print-html';
export type { ReceiptPaperWidth } from './print-html';
