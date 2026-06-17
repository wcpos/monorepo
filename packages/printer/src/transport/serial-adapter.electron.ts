import type { TypedIpcRenderer } from '@wcpos/printer/ipc-channels';

import type { PrinterTransport } from '../types';

function getIpc(): TypedIpcRenderer {
	const w = window as {
		ipcRenderer?: TypedIpcRenderer;
		electronAPI?: { ipcRenderer?: TypedIpcRenderer };
	};
	const ipc = w.ipcRenderer ?? w.electronAPI?.ipcRenderer;
	if (!ipc) throw new Error('Electron ipcRenderer not available');
	return ipc;
}

const PRINT_TIMEOUT_MS = 30_000;

/** Electron serial adapter — sends raw bytes to the main process, which writes to the serial device
 * (macOS /dev/cu.*, Linux /dev/rfcomm*) for OS-paired Bluetooth Classic printers. */
export class SerialElectronAdapter implements PrinterTransport {
	readonly name = 'serial-electron';

	constructor(private deviceKey: string) {}

	async printRaw(data: Uint8Array): Promise<void> {
		const ipc = getIpc();
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				ipc.invoke('print-raw-serial', { device: this.deviceKey, data: Array.from(data) }),
				new Promise<never>((_, reject) => {
					timeoutId = setTimeout(
						() => reject(new Error(`Serial print timed out after ${PRINT_TIMEOUT_MS}ms`)),
						PRINT_TIMEOUT_MS
					);
				}),
			]);
		} finally {
			if (timeoutId !== undefined) clearTimeout(timeoutId);
		}
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error('SerialElectronAdapter does not support HTML printing. Use printRaw instead.');
	}
}
