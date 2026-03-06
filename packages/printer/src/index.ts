export { encodeReceipt } from './encoder/encode-receipt';
export type { EncodeReceiptOptions } from './encoder/encode-receipt';
export { mapReceiptData } from './encoder/map-receipt-data';
export type { ReceiptData } from './encoder/types';
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
export type {
  PrinterTransport,
  PrinterProfile,
  DiscoveredPrinter,
  PrintJob,
  UsePrintResult,
} from './types';
