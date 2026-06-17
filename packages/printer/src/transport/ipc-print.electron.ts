interface ElectronIpc {
	invoke: (channel: string, args: unknown) => Promise<unknown>;
}

function getIpc(): ElectronIpc {
	const w = window as {
		ipcRenderer?: ElectronIpc;
		electronAPI?: { ipcRenderer?: ElectronIpc };
	};
	const ipc = w.ipcRenderer ?? w.electronAPI?.ipcRenderer;
	if (!ipc) throw new Error('Electron ipcRenderer not available');
	return ipc;
}

export const PRINT_TIMEOUT_MS = 30_000;

export async function ipcPrintRaw(
	channel: string,
	args: Record<string, unknown>,
	timeoutMessage: string
): Promise<void> {
	const ipc = getIpc();
	const data = args.data;
	if (!(data instanceof Uint8Array)) {
		throw new Error('ipcPrintRaw expected args.data to be a Uint8Array');
	}

	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			ipc.invoke(channel, { ...args, data: Array.from(data) }),
			new Promise<never>((_, reject) => {
				timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), PRINT_TIMEOUT_MS);
			}),
		]);
	} finally {
		if (timeoutId !== undefined) clearTimeout(timeoutId);
	}
}
