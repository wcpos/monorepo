import type { StorageFootprint } from './measure-storage-types';

export type { StorageFootprint, StorageFootprintEntry } from './measure-storage-types';

type ElectronBridgeIpcRenderer = {
	invoke(channel: string, args: unknown): Promise<unknown>;
};

type MainStorageEntry = { name: string; bytes: number; root: 'fsdbs' | 'legacy-sqlite' };

/**
 * Electron: the RxDB data lives in the MAIN process (filesystem-node storage
 * under userData), so the renderer's own storage APIs legitimately see ~0
 * bytes. The main process walks its base paths behind `storage:measure`;
 * an older main process without the handler rejects the invoke and the
 * measurement reports null — the health screen then simply hides its
 * storage lines instead of showing a zero it cannot back up.
 */
export async function measureAppStorage(): Promise<StorageFootprint | null> {
	const ipcRenderer = (window as unknown as Window & { ipcRenderer?: ElectronBridgeIpcRenderer })
		.ipcRenderer;
	if (!ipcRenderer) return null;
	try {
		const result = (await ipcRenderer.invoke('storage:measure', undefined)) as {
			entries?: MainStorageEntry[];
		};
		if (!result || !Array.isArray(result.entries)) return null;
		return {
			entries: result.entries.map((entry) => ({
				name: entry.name,
				bytes: entry.bytes,
				...(entry.root === 'legacy-sqlite' ? { legacy: true } : {}),
			})),
			estimateBytes: null,
		};
	} catch {
		return null;
	}
}
