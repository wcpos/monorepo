import type { TypedIpcRenderer } from '@wcpos/printer/ipc-channels';

// Matches SystemPrintAdapter's print timeout: the hidden BrowserWindow must
// load the external URL and render before printing, so the 10s fetch timeout
// used by the web implementation is too tight here.
const PRINT_TIMEOUT_MS = 30_000;

type ElectronWindow = Window & {
	ipcRenderer?: TypedIpcRenderer;
};

function getIpc(): TypedIpcRenderer {
	const ipc = (window as ElectronWindow).ipcRenderer;
	if (!ipc) throw new Error('Electron ipcRenderer not available');
	return ipc;
}

/**
 * Electron implementation: use IPC to print a URL directly via a hidden BrowserWindow.
 * This avoids CORS issues that would block fetch().
 */
export async function printFromUrl(
	url: string,
	_printHtml: (html: string) => Promise<void>
): Promise<void> {
	const ipc = getIpc();
	const jobId = crypto.randomUUID();

	return new Promise<void>((resolve, reject) => {
		const afterChannel = `onAfterPrint-${jobId}`;
		const errorChannel = `onPrintError-${jobId}`;

		const timeoutId = setTimeout(() => {
			cleanup();
			reject(new Error(`Electron print timed out after ${PRINT_TIMEOUT_MS}ms`));
		}, PRINT_TIMEOUT_MS);

		// ipc.on() returns an unsubscribe function (preload doesn't expose removeListener)
		let unsubAfter: (() => void) | undefined;
		let unsubError: (() => void) | undefined;

		const cleanup = () => {
			clearTimeout(timeoutId);
			unsubAfter?.();
			unsubError?.();
		};

		unsubAfter = ipc.on(afterChannel, () => {
			cleanup();
			resolve();
		});
		// The preload strips the IPC event arg, so the first callback arg is the
		// error payload itself (see SystemPrintAdapter.printHtml).
		unsubError = ipc.on(errorChannel, (error: unknown) => {
			cleanup();
			reject(new Error(`Electron print failed: ${String(error ?? 'unknown error')}`));
		});

		ipc.send('print-external-url', {
			externalURL: url,
			printJobId: jobId,
		});
	});
}
