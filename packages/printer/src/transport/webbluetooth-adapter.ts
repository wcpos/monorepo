/// <reference path="../types/point-of-sale-connectors.d.ts" />
import { requestKnownBluetoothDevice } from '../discovery/bluetooth-scan-session';
import { printerLogger } from '../logger';
import { forgetBleDevice, getBleDevice, rememberBleDevice } from './ble-device-registry';
import {
	BLE_PRINT_SERVICE_UUIDS,
	connectBleReceiptPrinter,
	type WebBluetoothNavigator,
} from './ble-gatt';
import { loadWebDevice } from './web-device-store';
import { waitForWebPrinterReconnect } from './web-reconnect';

import type { PrinterTransport } from '../types';

export class WebBluetoothAdapter implements PrinterTransport {
	readonly name = 'webbluetooth';

	constructor(private deviceKey: string) {}

	async printRaw(data: Uint8Array): Promise<void> {
		let live = getBleDevice(this.deviceKey);
		const device = loadWebDevice(this.deviceKey);
		if (!live && !device) {
			throw new Error(
				'Bluetooth printer is not connected. Open printer settings and reconnect it.'
			);
		}
		const bluetooth =
			typeof navigator === 'undefined' ? undefined : (navigator as WebBluetoothNavigator).bluetooth;
		const path = live ? 'live' : bluetooth?.requestDevice && device?.id ? 'requested' : 'library';
		printerLogger.debug('Bluetooth print path', { context: { path } });
		if (!live && bluetooth?.requestDevice && device?.id) {
			try {
				live = await requestKnownBluetoothDevice(device.id, {
					acceptAllDevices: true,
					optionalServices: BLE_PRINT_SERVICE_UUIDS,
				});
				rememberBleDevice(this.deviceKey, live);
			} catch (error) {
				// requestDevice needs a user gesture; a queued print may not have one. Fall back.
				printerLogger.debug('Bluetooth re-request failed, using library reconnect', {
					context: { cause: error instanceof Error ? error.message : String(error) },
				});
			}
		}
		if (live) {
			try {
				const printer = await connectBleReceiptPrinter(live);
				try {
					await printer.write(data);
				} finally {
					await printer.disconnect();
				}
			} catch (error) {
				if (/NetworkError|disconnected|not connected/i.test(String(error)))
					forgetBleDevice(this.deviceKey);
				throw error;
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
