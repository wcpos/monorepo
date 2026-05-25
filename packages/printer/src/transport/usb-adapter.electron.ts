import type { PrinterTransport } from '../types';

interface ElectronIpc {
	invoke: (channel: string, args: unknown) => Promise<unknown>;
}

function getIpc(): ElectronIpc {
	const ipc = (window as any).ipcRenderer as ElectronIpc | undefined;
	if (!ipc) throw new Error('Electron ipcRenderer not available');
	return ipc;
}

const PRINT_TIMEOUT_MS = 30_000;

/** Electron USB adapter — sends raw bytes to the main process, which writes to the USB endpoint. */
export class UsbElectronAdapter implements PrinterTransport {
	readonly name = 'usb-electron';

	constructor(private deviceKey: string) {}

	async printRaw(data: Uint8Array): Promise<void> {
		const ipc = getIpc();
		await Promise.race([
			ipc.invoke('print-raw-usb', { device: this.deviceKey, data: Array.from(data) }),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error(`USB print timed out after ${PRINT_TIMEOUT_MS}ms`)),
					PRINT_TIMEOUT_MS
				)
			),
		]);
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error('UsbElectronAdapter does not support HTML printing. Use printRaw instead.');
	}
}
