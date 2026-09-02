import type { IpcInvokeChannels, TypedIpcRenderer } from '@wcpos/printer/ipc-channels';

export function getIpc(): TypedIpcRenderer {
	const w = window as {
		ipcRenderer?: TypedIpcRenderer;
		electronAPI?: { ipcRenderer?: TypedIpcRenderer };
	};
	const ipc = w.ipcRenderer ?? w.electronAPI?.ipcRenderer;
	if (!ipc) throw new Error('Electron ipcRenderer not available');
	return ipc;
}

export const PRINT_TIMEOUT_MS = 30_000;

/** Raw ESC/POS print channels — bytes cross IPC as a structured-cloned Uint8Array. */
type RawPrintChannel = 'print-raw-serial' | 'print-raw-usb' | 'print-raw-tcp';
type RawPrintArgs<C extends RawPrintChannel> = Omit<IpcInvokeChannels[C]['req'], 'data'> & {
	data: Uint8Array;
};

export async function ipcPrintRaw<C extends RawPrintChannel>(
	channel: C,
	args: RawPrintArgs<C>,
	timeoutMessage: string
): Promise<void> {
	const ipc = getIpc();
	const data = args.data;
	if (!(data instanceof Uint8Array)) {
		throw new Error('ipcPrintRaw expected args.data to be a Uint8Array');
	}

	// Structured clone carries the Uint8Array across IPC directly — no number[]
	// copy (~8x memory shape for large raster receipts). The main process accepts
	// both shapes since wcpos/electron#353, pinned by the same change as this file.
	const payload = { ...args, data } as IpcInvokeChannels[C]['req'];

	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			ipc.invoke(channel, payload),
			new Promise<never>((_, reject) => {
				timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), PRINT_TIMEOUT_MS);
			}),
		]);
	} finally {
		if (timeoutId !== undefined) clearTimeout(timeoutId);
	}
}
