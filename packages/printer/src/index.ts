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
export type { PrinterServiceOptions } from './printer-service';
export { CloudAdapter } from './transport/cloud-adapter';
export { isWebUsbSupported, isWebBluetoothSupported } from './transport/device-capabilities';
export type { CloudEnqueueFn, CloudPrintJob } from './transport/cloud-adapter';
export { usePrint } from './hooks/use-print';
export { usePrinterDiscovery } from './hooks/use-printer-discovery';
export { RasterizeProvider, useOptionalRasterize, useRasterize } from './raster/rasterize-provider';
export type { RasterizeInput } from './raster/rasterize-provider';
export { resolvePrinter } from './resolve-printer';
export type { TemplateInfo, ResolvePrinterOptions } from './resolve-printer';
export { detectMismatch } from './detect-mismatch';
export { probeVendor, probeVendorEndpoint } from './utils/probe-vendor';
export type { ProbedEndpoint } from './utils/probe-vendor';
export { isPrinterConnectionError, PrinterConnectionError } from './utils/connection-error';
export type { ConnectionDiagnostics } from './utils/connection-error';
export type {
	PrinterTransport,
	PrinterProfile,
	DiscoveredPrinter,
	PrintJob,
	UsePrintResult,
	DiscoveryErrorCode,
	DiscoveryError,
	BluetoothCandidate,
} from './types';
export { buildPrintableReceiptHtml, normalizeReceiptPaperWidth } from './print-html';
export type { ReceiptPaperWidth } from './print-html';
export { DEFAULT_THERMAL_TEMPLATE } from './encoder/default-thermal-template';
