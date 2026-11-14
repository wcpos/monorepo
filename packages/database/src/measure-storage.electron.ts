import { measureCacheStorage } from './measure-cache-storage';

import type { StorageFootprint } from './measure-storage-types';

export type { StorageFootprint, StorageFootprintEntry } from './measure-storage-types';

type ElectronBridgeIpcRenderer = {
	invoke(channel: string, args: unknown): Promise<unknown>;
};

/**
 * `sqlite` is the 2.0 engine's root (one entry per database, sidecars summed by
 * main); `fsdbs` (the 1.10 filesystem engine) and `legacy-sqlite` (pre-1.9) are
 * retired roots the post-readiness purge removes, so both read as legacy.
 */
type MainStorageRoot = 'sqlite' | 'fsdbs' | 'legacy-sqlite' | 'image-cache';
type MainStorageEntry = { name: string; bytes: number; root: MainStorageRoot };
const LEGACY_MAIN_STORAGE_ROOTS: readonly MainStorageRoot[] = ['fsdbs', 'legacy-sqlite'];

/**
 * Electron: the RxDB data lives in the MAIN process (SQLite under userData,
 * #2242), so the renderer's database storage APIs see ~0 bytes. The
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
					...(LEGACY_MAIN_STORAGE_ROOTS.includes(entry.root) ? { legacy: true } : {}),
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
