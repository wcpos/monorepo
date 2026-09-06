/// <reference path="../types/point-of-sale-connectors.d.ts" />
import { requestKnownBluetoothDevice } from '../discovery/bluetooth-scan-session';
import { printerLogger } from '../logger';
import { getBleDevice, rememberBleDevice } from './ble-device-registry';
import {
	BLE_PRINT_SERVICE_UUIDS,
	connectBleReceiptPrinter,
	type WebBluetoothNavigator,
} from './ble-gatt';
import { statusQueryUnavailable } from './escpos-status';
import { loadWebDevice } from './web-device-store';
import { waitForWebPrinterReconnect } from './web-reconnect';

import type { PrinterStatus } from './escpos-status';
import type { PrinterTransport } from '../types';

// Give a temporarily unavailable BLE printer a moment before retrying the connection once.
export const BLE_RECONNECT_DELAY_MS = 1500;

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
			let printer;
			try {
				printer = await connectBleReceiptPrinter(live);
			} catch (error) {
				if (!/no longer in range|NetworkError/i.test(String(error))) throw error;
				printerLogger.debug('Bluetooth connection failed, retrying once', {
					context: { cause: String(error) },
				});
				await new Promise<void>((resolve) => setTimeout(resolve, BLE_RECONNECT_DELAY_MS));
				try {
					printer = await connectBleReceiptPrinter(live);
				} catch (retryError) {
					printerLogger.debug('Bluetooth connection retry failed', {
						context: {
							cause: retryError instanceof Error ? retryError.message : String(retryError),
						},
					});
					throw new Error(
						'Bluetooth printer is not responding. Turn it off and on again, then try again.'
					);
				}
			}
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

	/**
	 * Only the GATT path can ask: the library fallback owns its own connection and exposes no read.
	 * The keep-alive link from the job just printed is the one this reads over.
	 */
	async queryStatus(): Promise<PrinterStatus | null> {
		const live = getBleDevice(this.deviceKey);
		if (!live) return statusQueryUnavailable(this.name);
		let printer;
		try {
			printer = await connectBleReceiptPrinter(live);
		} catch (cause) {
			printerLogger.debug('Status query could not reach the printer', {
				context: { cause: cause instanceof Error ? cause.message : String(cause) },
			});
			return null;
		}
		try {
			return await printer.queryStatus();
		} finally {
			await printer.disconnect();
		}
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error('WebBluetoothAdapter does not support HTML printing. Use printRaw instead.');
	}
}
