import type { PrinterTransport } from '../types';

type NativeConnectionType = 'network' | 'bluetooth' | 'usb';

function toEpsonTarget(address: string, connectionType: NativeConnectionType): string {
	if (/^(TCP|BT|USB):/i.test(address)) {
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

		try {
			await printer.connect();
			await printer.addCommand(data);
			await printer.sendData();
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
