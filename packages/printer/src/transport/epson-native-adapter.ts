import { printerLogger } from '../logger';
import { logPrintJob } from './log-print-job';

import type { PrinterTransport } from '../types';

type NativeConnectionType = 'network' | 'bluetooth' | 'usb';

function toEpsonTarget(address: string, connectionType: NativeConnectionType): string {
	if (/^(TCP|TCPS|BT|BLE|USB):/i.test(address)) {
		return address;
	}

	switch (connectionType) {
		case 'network':
			return `TCP:${address}`;
		case 'bluetooth':
			return `BT:${address}`;
		case 'usb':
			return `USB:${address}`;
		default: {
			const exhaustiveConnectionType: never = connectionType;
			throw new Error(`Unknown Epson connection type: ${exhaustiveConnectionType}`);
		}
	}
}

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
	private _printer: {
		connect: (timeout?: number) => Promise<void>;
		disconnect: () => Promise<void>;
		addCommand: (data: Uint8Array) => Promise<void>;
		sendData: (timeout?: number) => Promise<unknown>;
		getPrinterSetting: (type: number, timeout?: number) => Promise<{ value: number }>;
	} | null = null;

	constructor(
		private _address: string,
		private _connectionType: NativeConnectionType
	) {}

	private async getPrinter() {
		if (this._printer) {
			return this._printer;
		}

		const { Printer } = await import('react-native-esc-pos-printer');

		this._printer = new Printer({
			target: toEpsonTarget(this._address, this._connectionType),
			deviceName: 'WCPOS Epson Printer',
		});

		return this._printer;
	}

	async printRaw(data: Uint8Array): Promise<void> {
		const printer = await this.getPrinter();
		const target = toEpsonTarget(this._address, this._connectionType);

		try {
			await logPrintJob(
				'Native',
				{ transport: this.name, target, bytes: data.byteLength },
				async () => {
					await printer.connect();
					await printer.addCommand(data);
					await printer.sendData();
				}
			);
		} finally {
			await this.disconnect();
		}
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error(
			'EpsonNativeAdapter does not support HTML printing. ' +
				'Use SystemPrintAdapter for HTML output.'
		);
	}

	async getPaperWidthMm(): Promise<58 | 60 | 70 | 76 | 80 | undefined> {
		try {
			const printer = await this.getPrinter();
			const { PrinterGetSettingsType } = await import('react-native-esc-pos-printer');
			const result = await (async () => {
				try {
					await printer.connect(5_000);
					return await printer.getPrinterSetting(
						PrinterGetSettingsType.PRINTER_SETTING_PAPERWIDTH,
						5_000
					);
				} finally {
					await this.disconnect();
				}
			})();
			return [58, 60, 70, 76, 80].includes(result.value)
				? (result.value as 58 | 60 | 70 | 76 | 80)
				: undefined;
		} catch (error) {
			printerLogger.debug('Epson paper width query failed', {
				context: { cause: error instanceof Error ? error.message : String(error) },
			});
			return undefined;
		}
	}

	async disconnect(): Promise<void> {
		if (!this._printer) {
			return;
		}

		try {
			await this._printer.disconnect();
		} finally {
			this._printer = null;
		}
	}
}

export { toEpsonTarget };
