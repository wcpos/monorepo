import PQueue from 'p-queue';

import { encodeReceipt } from './encoder/encode-receipt';
import { encodeThermalTemplate } from './renderer';
import { NetworkAdapter } from './transport/network-adapter';
import { SystemPrintAdapter } from './transport/system-print-adapter';

import type { EncodeReceiptOptions } from './encoder/encode-receipt';
import type { ReceiptData } from './encoder/types';
import type { PrinterProfile, PrinterTransport } from './types';

export class PrinterService {
  private queue = new PQueue({ concurrency: 1 });
  private transports = new Map<string, PrinterTransport>();

  /**
   * Get or create a transport for the given profile.
   */
  private getTransport(profile: PrinterProfile): PrinterTransport {
    const cached = this.transports.get(profile.id);
    if (cached) return cached;

    let transport: PrinterTransport;

    switch (profile.connectionType) {
      case 'network':
        transport = new NetworkAdapter(profile.address!, profile.port, profile.vendor);
        break;
      case 'system':
      default:
        transport = new SystemPrintAdapter();
        break;
    }

    this.transports.set(profile.id, transport);
    return transport;
  }

  /**
   * Print a receipt using the given profile.
   * If templateXml is provided, uses the custom XML template via encodeThermalTemplate().
   * Otherwise falls back to the built-in default layout via encodeReceipt().
   */
  async printReceipt(
    receiptData: ReceiptData,
    profile?: PrinterProfile,
    html?: string,
    templateXml?: string,
  ): Promise<void> {
    return this.queue.add(async () => {
      if (!profile || profile.connectionType === 'system') {
        const transport = new SystemPrintAdapter();
        if (!html) {
          throw new Error('System printing requires HTML content');
        }
        await transport.printHtml(html);
        return;
      }

      const transport = this.getTransport(profile);
      const encoderOptions = {
        language: profile.language,
        columns: profile.columns,
        printerModel: profile.printerModel,
      };

      let bytes: Uint8Array;
      if (templateXml) {
        bytes = encodeThermalTemplate(templateXml, receiptData, encoderOptions);
      } else {
        const encodeOpts: EncodeReceiptOptions = {
          ...encoderOptions,
          cut: profile.autoCut,
          openDrawer: profile.autoOpenDrawer,
        };
        bytes = encodeReceipt(receiptData, encodeOpts);
      }

      await transport.printRaw(bytes);
    });
  }

  /**
   * Print pre-encoded raw bytes.
   */
  async printRaw(data: Uint8Array, profile: PrinterProfile): Promise<void> {
    return this.queue.add(async () => {
      const transport = this.getTransport(profile);
      await transport.printRaw(data);
    });
  }

  /**
   * Print HTML via system dialog.
   */
  async printHtml(html: string): Promise<void> {
    return this.queue.add(async () => {
      const transport = new SystemPrintAdapter();
      await transport.printHtml(html);
    });
  }

  /**
   * Send a test print to verify connectivity.
   */
  async testPrint(profile: PrinterProfile): Promise<void> {
    return this.queue.add(async () => {
      const transport = this.getTransport(profile);

      // Import encoder dynamically to keep the test print self-contained
      const ReceiptPrinterEncoder = (await import('@point-of-sale/receipt-printer-encoder')).default;

      const encoder = new ReceiptPrinterEncoder({
        language: profile.language,
        columns: profile.columns,
        ...(profile.printerModel ? { printerModel: profile.printerModel } : {}),
      });

      const data = encoder
        .initialize()
        .codepage('auto')
        .align('center')
        .bold(true)
        .line('WooCommerce POS')
        .bold(false)
        .line('Test Print')
        .newline()
        .line(`Printer: ${profile.name}`)
        .line(`Connection: ${profile.connectionType}`)
        .line(`Date: ${new Date().toLocaleString()}`)
        .newline()
        .line('If you can read this,')
        .line('printing works!')
        .newline(2)
        .cut('partial')
        .encode();

      await transport.printRaw(data);
    });
  }

  /**
   * Clean up all transports.
   */
  async dispose(): Promise<void> {
    for (const transport of this.transports.values()) {
      await transport.disconnect?.();
    }
    this.transports.clear();
    this.queue.clear();
  }
}
