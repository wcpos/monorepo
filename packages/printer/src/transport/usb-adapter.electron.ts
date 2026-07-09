import { ipcPrintRaw, PRINT_TIMEOUT_MS } from './ipc-print.electron';

import type { PrinterTransport } from '../types';

/** Electron USB adapter — sends raw bytes to the main process, which writes to the USB endpoint. */
export class UsbElectronAdapter implements PrinterTransport {
	readonly name = 'usb-electron';

	constructor(private deviceKey: string) {}

	async printRaw(data: Uint8Array): Promise<void> {
		await ipcPrintRaw(
			'print-raw-usb',
			{ device: this.deviceKey, data },
			`USB print timed out after ${PRINT_TIMEOUT_MS}ms`
		);
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error('UsbElectronAdapter does not support HTML printing. Use printRaw instead.');
	}
}
