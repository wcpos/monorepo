import type { PrinterTransport } from '../types';

/**
 * Star WebPRNT adapter for web browsers.
 *
 * Star printers with a WebPRNT interface expose an HTTP endpoint that
 * accepts XML-wrapped print commands. This adapter converts raw ESC/POS
 * (or StarPRNT) byte arrays into the Star WebPRNT XML format and POSTs
 * them directly using fetch() -- no vendor SDK required.
 *
 * Typical endpoint URL:
 *   https://192.168.1.100/StarWebPRNT/SendMessage
 *
 * If your Star printer uses HTTP instead of HTTPS, the browser may block
 * mixed-content requests. Either access your POS app over HTTP as well,
 * or configure a reverse proxy.
 */
export class StarWebPrntAdapter implements PrinterTransport {
  readonly name = 'star-webprnt';

  constructor(private url: string) {}

  async printRaw(data: Uint8Array): Promise<void> {
    const base64 = uint8ArrayToBase64(data);

    const xml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<StarWebPrint xmlns="http://schema.starwebprnt.com" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">',
      '  <SendMessage>',
      '    <Request>',
      '      <initialize />',
      `      <rawData>${base64}</rawData>`,
      '      <cutpaper feed="true" />',
      '    </Request>',
      '  </SendMessage>',
      '</StarWebPrint>',
    ].join('\n');

    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
      },
      body: xml,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Star WebPRNT request failed (HTTP ${response.status}): ${body || response.statusText}`,
      );
    }

    // Parse the response XML to check for printer errors
    const responseText = await response.text();
    const statusMatch = responseText.match(/<Status>(\w+)<\/Status>/);
    if (statusMatch && statusMatch[1] !== 'Normal') {
      throw new Error(`Star printer reported status: ${statusMatch[1]}`);
    }
  }

  async printHtml(_html: string): Promise<void> {
    throw new Error('StarWebPrntAdapter does not support HTML printing.');
  }

  async disconnect(): Promise<void> {
    // HTTP is stateless -- nothing to clean up
  }
}

/**
 * Convert a Uint8Array to a base64 string.
 *
 * Uses the browser's btoa() when available, which covers all
 * modern browsers and web workers.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
