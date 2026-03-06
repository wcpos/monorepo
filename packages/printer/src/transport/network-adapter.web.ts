import { EpsonEposAdapter } from './epson-epos-adapter';
import { StarWebPrntAdapter } from './star-webprnt-adapter';

import type { PrinterTransport } from '../types';

/**
 * Web network adapter — delegates to vendor-specific adapters.
 *
 * Browsers cannot open raw TCP sockets, so network printing on web
 * requires a vendor-specific protocol:
 *
 * - **Star** printers expose an HTTP endpoint (Star WebPRNT) that
 *   accepts XML-wrapped print commands via POST.
 * - **Epson** printers expose a WebSocket endpoint (ePOS) that the
 *   Epson ePOS SDK connects to.
 *
 * If no vendor is specified, throws with guidance on how to configure
 * the printer profile.
 */
export class NetworkAdapter implements PrinterTransport {
  readonly name = 'network-web';
  private delegate: PrinterTransport;

  constructor(host: string, port: number = 9100, vendor?: string) {
    switch (vendor) {
      case 'epson':
        this.delegate = new EpsonEposAdapter(host, port === 9100 ? 8043 : port);
        break;
      case 'star':
        this.delegate = new StarWebPrntAdapter(`https://${host}/StarWebPRNT/SendMessage`);
        break;
      default:
        throw new Error(
          'Direct network printing in web browsers requires a vendor-specific protocol. ' +
            'Set your printer vendor to "Epson" or "Star" in printer settings, ' +
            'or use the system print dialog instead.',
        );
    }
  }

  async printRaw(data: Uint8Array): Promise<void> {
    return this.delegate.printRaw(data);
  }

  async printHtml(html: string): Promise<void> {
    return this.delegate.printHtml(html);
  }

  async disconnect(): Promise<void> {
    return this.delegate.disconnect?.();
  }
}
