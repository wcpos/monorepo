import { measureCacheStorage } from './measure-cache-storage';

import type { StorageFootprint } from './measure-storage-types';

export type { StorageFootprint, StorageFootprintEntry } from './measure-storage-types';

type ElectronBridgeIpcRenderer = {
	invoke(channel: string, args: unknown): Promise<unknown>;
};

type MainStorageRoot = 'fsdbs' | 'legacy-sqlite' | 'image-cache';
type MainStorageEntry = { name: string; bytes: number; root: MainStorageRoot };

/**
 * Electron: the RxDB data lives in the MAIN process (filesystem-node storage
 * under userData), so the renderer's database storage APIs see ~0 bytes. The
 * main process walks its base paths behind `storage:measure`;
 * an older main process without the handler rejects the invoke and the
 * measurement reports null — the health screen then simply hides its
 * storage lines instead of showing a zero it cannot back up.
 */
export async function measureAppStorage(): Promise<StorageFootprint | null> {
	const ipcRenderer = (window as unknown as Window & { ipcRenderer?: ElectronBridgeIpcRenderer })
		.ipcRenderer;
	if (!ipcRenderer) return null;
	try {
		const cacheStorage = await measureCacheStorage();
		const result = (await ipcRenderer.invoke('storage:measure', undefined)) as {
			entries?: MainStorageEntry[];
		};
		if (!result || !Array.isArray(result.entries)) return null;
		const imageEntries = result.entries.filter((entry) => entry.root === 'image-cache');
		return {
			entries: result.entries
				.filter((entry) => entry.root !== 'image-cache')
				.map((entry) => ({
					name: entry.name,
					bytes: entry.bytes,
					...(entry.root === 'legacy-sqlite' ? { legacy: true } : {}),
				})),
			estimateBytes: null,
			estimateDetails: null,
			imageCacheBytes:
				cacheStorage === null && imageEntries.length === 0
					? null
					: (cacheStorage?.imageCacheBytes ?? 0) +
						imageEntries.reduce((sum, entry) => sum + entry.bytes, 0),
			opaqueCacheEntries: cacheStorage?.opaqueCacheEntries ?? 0,
		};
	} catch {
		return null;
	}
}
