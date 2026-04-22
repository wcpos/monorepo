import type { InterfaceType as StarInterfaceType } from 'react-native-star-io10';
import type { PrinterTransport } from '../types';

type NativeConnectionType = 'network' | 'bluetooth' | 'usb';

type StarPrinterLike = {
	open: () => Promise<void>;
	printRawData: (data: number[]) => Promise<void>;
	close: () => Promise<void>;
	dispose?: () => Promise<void>;
};

function normalizeStarInterfaceType(interfaceType?: string): string | undefined {
	return interfaceType?.toLowerCase().replace(/[^a-z]/g, '');
}

function resolveStarInterfaceType(
	interfaceType: {
		Lan: StarInterfaceType;
		Bluetooth: StarInterfaceType;
		BluetoothLE?: StarInterfaceType;
		Usb: StarInterfaceType;
	},
	connectionType: NativeConnectionType,
	identifier: string,
	preservedInterfaceType?: string
): StarInterfaceType {
	const normalizedInterfaceType = normalizeStarInterfaceType(preservedInterfaceType);

	if (normalizedInterfaceType === 'lan') {
		return interfaceType.Lan;
	}

	if (normalizedInterfaceType === 'usb') {
		return interfaceType.Usb;
	}

	if (normalizedInterfaceType === 'bluetoothle' && interfaceType.BluetoothLE) {
		return interfaceType.BluetoothLE;
	}

	if (normalizedInterfaceType === 'bluetooth') {
		return interfaceType.Bluetooth;
	}

	if (connectionType === 'network') {
		return interfaceType.Lan;
	}

	if (connectionType === 'usb') {
		return interfaceType.Usb;
	}

	if (/ble/i.test(identifier) && interfaceType.BluetoothLE) {
		return interfaceType.BluetoothLE;
	}

	return interfaceType.Bluetooth;
}

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
	private _printer: StarPrinterLike | null = null;

	constructor(
		private _identifier: string,
		private _connectionType: NativeConnectionType,
		private _nativeInterfaceType?: string
	) {}

	private async getPrinter(): Promise<StarPrinterLike> {
		if (this._printer) {
			return this._printer;
		}

		const { StarPrinter, StarConnectionSettings, InterfaceType } =
			await import('react-native-star-io10');

		const settings = new StarConnectionSettings();
		settings.identifier = this._identifier;
		const resolvedInterfaceType = resolveStarInterfaceType(
			InterfaceType,
			this._connectionType,
			this._identifier,
			this._nativeInterfaceType
		);
		settings.interfaceType = resolvedInterfaceType;
		// Enable settings.autoSwitchInterface when resolvedInterfaceType is
		// InterfaceType.BluetoothLE, or as a legacy fallback when
		// this._nativeInterfaceType was not preserved and
		// this._connectionType === 'bluetooth', so older profiles/discovery
		// records can still switch onto BLE-capable transports.
		settings.autoSwitchInterface =
			resolvedInterfaceType === InterfaceType.BluetoothLE ||
			(!this._nativeInterfaceType && this._connectionType === 'bluetooth');

		this._printer = new StarPrinter(settings) as StarPrinterLike;
		return this._printer;
	}

	async printRaw(data: Uint8Array): Promise<void> {
		const printer = await this.getPrinter();

		try {
			await printer.open();
			await printer.printRawData(Array.from(data));
		} finally {
			await this.disconnect();
		}
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error(
			'StarNativeAdapter does not support HTML printing. ' +
				'Use SystemPrintAdapter for HTML output.'
		);
	}

	async disconnect(): Promise<void> {
		if (!this._printer) {
			return;
		}

		try {
			await this._printer.close();
			await this._printer.dispose?.();
		} finally {
			this._printer = null;
		}
	}
}

export { resolveStarInterfaceType };
