/// <reference path="../types/point-of-sale-connectors.d.ts" />
import { connectBleReceiptPrinter } from './ble-gatt';
import { loadWebDevice } from './web-device-store';
import { waitForWebPrinterReconnect } from './web-reconnect';

import type { PrinterTransport } from '../types';

function hasGatt(device: unknown): device is Parameters<typeof connectBleReceiptPrinter>[0] {
	return typeof device === 'object' && device !== null && 'gatt' in device && Boolean(device.gatt);
}

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
		if (hasGatt(device)) {
			const printer = await connectBleReceiptPrinter(device);
			try {
				await printer.write(data);
			} finally {
				await printer.disconnect();
			}
			return;
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
