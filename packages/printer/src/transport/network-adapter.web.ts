import type { PrinterTransport } from '../types';

/**
 * Web network adapter — placeholder.
 *
 * Browsers cannot open raw TCP sockets. Network printing on web
 * uses vendor-specific JS SDKs (Epson ePOS, Star WebPRNT) which
 * are implemented as separate adapters.
 */
export class NetworkAdapter implements PrinterTransport {
  readonly name = 'network-web';

  constructor(
    private _host: string,
    private _port: number = 9100,
  ) {}

  async printRaw(_data: Uint8Array): Promise<void> {
    throw new Error(
      'Raw TCP printing is not available in web browsers. ' +
      'Configure an Epson or Star network printer for web printing.',
    );
  }

  async printHtml(_html: string): Promise<void> {
    throw new Error('NetworkAdapter does not support HTML printing.');
  }
}
