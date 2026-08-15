import { ipcPrintRaw, PRINT_TIMEOUT_MS } from './ipc-print.electron';

import type { PrinterTransport } from '../types';

/** Electron serial adapter — sends raw bytes to the main process, which writes to the serial device
 * (macOS /dev/cu.*, Linux /dev/rfcomm*) for OS-paired Bluetooth Classic printers. */
export class SerialElectronAdapter implements PrinterTransport {
	readonly name = 'serial-electron';

	constructor(private deviceKey: string) {}

	async printRaw(data: Uint8Array): Promise<void> {
		await ipcPrintRaw(
			'print-raw-serial',
			{ device: this.deviceKey, data },
			`Serial print timed out after ${PRINT_TIMEOUT_MS}ms`
		);
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error('SerialElectronAdapter does not support HTML printing. Use printRaw instead.');
	}
}
