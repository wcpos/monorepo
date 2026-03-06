import type { PrinterTransport } from '../types';

/**
 * Star Micronics native SDK adapter.
 * Uses react-native-star-io10 for direct communication with Star printers.
 *
 * Prerequisites:
 * - Install: pnpm add react-native-star-io10 (in apps/main)
 * - Rebuild dev client: eas build --profile development
 * - iOS: Bluetooth usage description in Info.plist (already configured)
 * - Android: Bluetooth permissions in AndroidManifest.xml
 *
 * The Star IO10 SDK handles:
 * - Network (Ethernet/WiFi) with discovery
 * - Bluetooth Classic and BLE
 * - USB
 * - Lightning (iOS)
 *
 * This adapter is for Bluetooth/USB connections where the generic TCP
 * NetworkAdapter can't be used. For network printing, NetworkAdapter
 * works fine with Star printers on port 9100.
 */
export class StarNativeAdapter implements PrinterTransport {
  readonly name = 'star-native';

  constructor(
    private _connectionSettings: string, // Star connection identifier from discovery
  ) {}

  async printRaw(_data: Uint8Array): Promise<void> {
    // TODO: Implement when react-native-star-io10 is installed
    //
    // import {
    //   StarPrinter,
    //   StarConnectionSettings,
    //   InterfaceType,
    // } from 'react-native-star-io10';
    //
    // const settings = new StarConnectionSettings();
    // settings.identifier = this._connectionSettings;
    // settings.interfaceType = InterfaceType.Lan; // or Bluetooth, Usb, etc.
    //
    // const printer = new StarPrinter(settings);
    // await printer.open();
    // await printer.print(_data);
    // await printer.close();
    throw new Error(
      'Star native printing requires react-native-star-io10. ' +
        'Install the package and rebuild the dev client.',
    );
  }

  async printHtml(_html: string): Promise<void> {
    throw new Error(
      'StarNativeAdapter does not support HTML printing. ' +
        'Use SystemPrintAdapter for HTML output.',
    );
  }

  async disconnect(): Promise<void> {
    // TODO: Close Star printer connection
    //
    // import { StarPrinter, StarConnectionSettings } from 'react-native-star-io10';
    // const settings = new StarConnectionSettings();
    // settings.identifier = this._connectionSettings;
    // const printer = new StarPrinter(settings);
    // await printer.close();
    // await printer.dispose();
  }
}
