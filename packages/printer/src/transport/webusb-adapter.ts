/// <reference path="../types/point-of-sale-connectors.d.ts" />
import { loadWebDevice } from './web-device-store';
import { waitForWebPrinterReconnect } from './web-reconnect';

import type { PrinterTransport } from '../types';

export class WebUsbAdapter implements PrinterTransport {
	readonly name = 'webusb';

	constructor(private deviceKey: string) {}

	async printRaw(data: Uint8Array): Promise<void> {
		const device = loadWebDevice(this.deviceKey);
		if (!device) {
			throw new Error('USB printer is not connected. Open printer settings and reconnect it.');
		}
		const { default: WebUSBReceiptPrinter } = await import('@point-of-sale/webusb-receipt-printer');
		const printer = new WebUSBReceiptPrinter();
		await waitForWebPrinterReconnect(printer, device, 'USB');
		printer.print(data);
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error('WebUsbAdapter does not support HTML printing. Use printRaw instead.');
	}
}
