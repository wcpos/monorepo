/// <reference path="../types/point-of-sale-connectors.d.ts" />
import { loadWebDevice } from './web-device-store';
import { waitForWebPrinterReconnect } from './web-reconnect';

import type { PrinterTransport } from '../types';

export class WebBluetoothAdapter implements PrinterTransport {
	readonly name = 'webbluetooth';

	constructor(private deviceKey: string) {}

	async printRaw(data: Uint8Array): Promise<void> {
		const device = loadWebDevice(this.deviceKey);
		if (!device) {
			throw new Error(
				'Bluetooth printer is not connected. Open printer settings and reconnect it.'
			);
		}
		const { default: WebBluetoothReceiptPrinter } =
			await import('@point-of-sale/webbluetooth-receipt-printer');
		const printer = new WebBluetoothReceiptPrinter();
		await waitForWebPrinterReconnect(printer, device, 'Bluetooth');
		printer.print(data);
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error('WebBluetoothAdapter does not support HTML printing. Use printRaw instead.');
	}
}
