/* eslint-disable import/no-default-export */
declare module '@point-of-sale/webusb-receipt-printer' {
	interface PosConnectedDeviceLike {
		type: 'usb' | 'bluetooth';
		language: 'esc-pos' | 'star-prnt';
		codepageMapping?: string;
		vendorId?: number;
		productId?: number;
		manufacturerName?: string;
		productName?: string;
		serialNumber?: string;
		name?: string;
		id?: string;
	}

	export default class WebUSBReceiptPrinter {
		connect(): void;
		reconnect(device: unknown): void;
		print(data: Uint8Array | number[]): void;
		addEventListener(
			type: 'connected' | 'disconnected' | 'data',
			cb: (device: PosConnectedDeviceLike) => void
		): void;
	}
}

declare module '@point-of-sale/webbluetooth-receipt-printer' {
	interface PosConnectedDeviceLike {
		type: 'usb' | 'bluetooth';
		language: 'esc-pos' | 'star-prnt';
		codepageMapping?: string;
		vendorId?: number;
		productId?: number;
		manufacturerName?: string;
		productName?: string;
		serialNumber?: string;
		name?: string;
		id?: string;
	}

	export default class WebBluetoothReceiptPrinter {
		connect(): void;
		reconnect(device: unknown): void;
		print(data: Uint8Array | number[]): void;
		addEventListener(
			type: 'connected' | 'disconnected' | 'data',
			cb: (device: PosConnectedDeviceLike) => void
		): void;
	}
}
