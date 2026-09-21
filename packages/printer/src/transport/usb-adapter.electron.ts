import { statusQueryUnavailable } from './escpos-status';
import { ipcPrintRaw, PRINT_TIMEOUT_MS } from './ipc-print.electron';

import type { PrinterStatus } from './escpos-status';
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

	/**
	 * The USB endpoint has a read path, but only the main process holds it, and that lives in
	 * another repo. Reading it needs a `usb-query-status` IPC channel beside `print-raw-usb`;
	 * until that exists this lane answers "cannot ask" (audit D4).
	 */
	async queryStatus(): Promise<PrinterStatus | null> {
		return statusQueryUnavailable(this.name);
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error('UsbElectronAdapter does not support HTML printing. Use printRaw instead.');
	}
}
