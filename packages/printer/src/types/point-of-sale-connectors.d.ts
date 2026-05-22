/* eslint-disable import/no-default-export */
declare module '@point-of-sale/webusb-receipt-printer' {
	import type { PosConnectedDevice } from './point-of-sale-connectors';

	export default class WebUSBReceiptPrinter {
		connect(): void;
		reconnect(device: unknown): void;
		print(data: Uint8Array | number[]): void;
		addEventListener(
			type: 'connected' | 'disconnected' | 'data',
			cb: (device: PosConnectedDevice) => void
		): void;
	}
}

declare module '@point-of-sale/webbluetooth-receipt-printer' {
	import type { PosConnectedDevice } from './point-of-sale-connectors';

	export default class WebBluetoothReceiptPrinter {
		connect(): void;
		reconnect(device: unknown): void;
		print(data: Uint8Array | number[]): void;
		addEventListener(
			type: 'connected' | 'disconnected' | 'data',
			cb: (device: PosConnectedDevice) => void
		): void;
	}
}
