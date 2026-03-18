import { FETCH_TIMEOUT_MS } from './constants';

interface ElectronIpc {
	send: (channel: string, args: unknown) => void;
	on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
}

function getIpc(): ElectronIpc {
	const ipc = (window as any).ipcRenderer as ElectronIpc | undefined;
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
			reject(new Error(`Electron print timed out after ${FETCH_TIMEOUT_MS}ms`));
		}, FETCH_TIMEOUT_MS);

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
		unsubError = ipc.on(errorChannel, (_event: unknown, error?: unknown) => {
			cleanup();
			reject(new Error(`Electron print failed: ${String(error ?? 'unknown error')}`));
		});

		ipc.send('print-external-url', {
			externalURL: url,
			printJobId: jobId,
		});
	});
}
