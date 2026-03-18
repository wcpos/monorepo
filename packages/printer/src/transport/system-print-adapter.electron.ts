import type { PrinterTransport } from '../types';

interface ElectronIpc {
	send: (channel: string, args: unknown) => void;
	on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
	invoke: (channel: string, args: unknown) => Promise<unknown>;
}

function getIpc(): ElectronIpc {
	const ipc = (window as any).ipcRenderer as ElectronIpc | undefined;
	if (!ipc) throw new Error('Electron ipcRenderer not available');
	return ipc;
}

/**
 * Electron system print adapter.
 * Sends print jobs to the main process via IPC.
 */
export class SystemPrintAdapter implements PrinterTransport {
	readonly name = 'system-print-electron';

	async printRaw(_data: Uint8Array): Promise<void> {
		// Raw byte printing via Electron is handled by ElectronNetworkAdapter.
		throw new Error('SystemPrintAdapter does not support raw byte printing.');
	}

	async printHtml(html: string): Promise<void> {
		const ipc = getIpc();
		const jobId = crypto.randomUUID();

		return new Promise<void>((resolve, reject) => {
			const afterChannel = `onAfterPrint-${jobId}`;
			const errorChannel = `onPrintError-${jobId}`;

			// ipc.on() returns an unsubscribe function (preload doesn't expose removeListener)
			const unsubAfter = ipc.on(afterChannel, () => {
				unsubError();
				resolve();
			});
			const unsubError = ipc.on(errorChannel, (_error: unknown) => {
				unsubAfter();
				reject(new Error(`Electron print failed: ${String(_error)}`));
			});

			// Send HTML as a data URL so the existing handler can load it
			const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
			ipc.send('print-external-url', {
				externalURL: dataUrl,
				printJobId: jobId,
			});
		});
	}
}
