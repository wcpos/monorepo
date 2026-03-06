import type { PrinterTransport } from '../types';

/**
 * Web system print adapter.
 * Creates a hidden iframe, loads HTML, calls window.print().
 */
export class SystemPrintAdapter implements PrinterTransport {
  readonly name = 'system-print-web';

  async printRaw(_data: Uint8Array): Promise<void> {
    throw new Error('SystemPrintAdapter does not support raw byte printing. Use printHtml instead.');
  }

  async printHtml(html: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Remove any existing print iframe
      const existing = document.getElementById('wcpos-print-frame');
      if (existing) {
        document.body.removeChild(existing);
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'wcpos-print-frame';
      iframe.style.position = 'absolute';
      iframe.style.top = '-10000px';
      iframe.style.left = '-10000px';
      iframe.style.width = '0';
      iframe.style.height = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
      if (!doc) {
        document.body.removeChild(iframe);
        reject(new Error('Cannot access iframe document'));
        return;
      }

      doc.open();
      doc.write(html);
      doc.close();

      // Wait for content to render before printing
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          setTimeout(() => {
            const el = document.getElementById('wcpos-print-frame');
            if (el) document.body.removeChild(el);
          }, 1000);
        }
      }, 500);
    });
  }
}
