import type { PrinterTransport } from '../types';

/**
 * Epson native SDK adapter.
 * Uses react-native-esc-pos-printer for direct communication with Epson TM printers.
 *
 * Prerequisites:
 * - Install: pnpm add react-native-esc-pos-printer (in apps/main)
 * - Rebuild dev client: eas build --profile development
 * - iOS: Bluetooth usage description in Info.plist (already configured)
 * - Android: Bluetooth/USB permissions in AndroidManifest.xml
 *
 * The Epson ePOS SDK handles:
 * - Network (TCP/WiFi) printing with auto-discovery
 * - Bluetooth Classic and BLE printing
 * - USB printing (Android)
 * - Its own ESC/POS encoding (but we send raw bytes via printCommand)
 *
 * This adapter is for Bluetooth/USB connections where the generic TCP
 * NetworkAdapter can't be used. For network printing, NetworkAdapter
 * works fine with Epson printers on port 9100.
 */
export class EpsonNativeAdapter implements PrinterTransport {
  readonly name = 'epson-native';

  constructor(
    private _target: string, // Epson device target string from discovery
  ) {}

  async printRaw(_data: Uint8Array): Promise<void> {
    // TODO: Implement when react-native-esc-pos-printer is installed
    //
    // import { Printer } from 'react-native-esc-pos-printer';
    // const printer = new Printer({ target: this._target });
    // await printer.connect();
    // await printer.addCommand(Buffer.from(_data));
    // await printer.send();
    // await printer.disconnect();
    throw new Error(
      'Epson native printing requires react-native-esc-pos-printer. ' +
        'Install the package and rebuild the dev client.',
    );
  }

  async printHtml(_html: string): Promise<void> {
    throw new Error(
      'EpsonNativeAdapter does not support HTML printing. ' +
        'Use SystemPrintAdapter for HTML output.',
    );
  }

  async disconnect(): Promise<void> {
    // TODO: Disconnect from Epson printer
    //
    // import { Printer } from 'react-native-esc-pos-printer';
    // const printer = new Printer({ target: this._target });
    // await printer.disconnect();
  }
}
