import * as Print from 'expo-print';

import type { PrinterTransport } from '../types';

/**
 * Native system print adapter.
 * Uses expo-print which shows the OS print dialog.
 */
export class SystemPrintAdapter implements PrinterTransport {
  readonly name = 'system-print-native';

  async printRaw(_data: Uint8Array): Promise<void> {
    throw new Error('SystemPrintAdapter does not support raw byte printing. Use printHtml instead.');
  }

  async printHtml(html: string): Promise<void> {
    await Print.printAsync({ html });
  }
}
