import { Directory, File, Paths } from 'expo-file-system';

import type { StorageFootprint, StorageFootprintEntry } from './measure-storage-types';

export type { StorageFootprint, StorageFootprintEntry } from './measure-storage-types';

const RXDB_DIRECTORY_PREFIX = 'rxdb-';

function measureDirectory(directory: Directory): number {
	let bytes = 0;
	for (const item of directory.list()) {
		if (item instanceof File) {
			bytes += item.size ?? 0;
		} else {
			bytes += measureDirectory(item);
		}
	}
	return bytes;
}

/**
 * Native: both the JS-thread `.expo-opfs` and worker `.worklet-opfs` roots,
 * plus the legacy SQLite directory as
 * one aggregate legacy entry. Sizes come from expo-file-system's synchronous
 * directory API — the same seam clear-all-db already uses.
 */
export async function measureAppStorage(): Promise<StorageFootprint | null> {
	try {
		const entries: StorageFootprintEntry[] = [];
		for (const rootName of ['.expo-opfs', '.worklet-opfs']) {
			const root = new Directory(Paths.document, rootName);
			if (!root.exists) continue;
			for (const item of root.list()) {
				if (!item.name.startsWith(RXDB_DIRECTORY_PREFIX)) continue;
				// Failures isolate per entry: one unreadable directory must not hide
				// every other database's footprint.
				try {
					entries.push({
						name: item.name,
						bytes: item instanceof File ? (item.size ?? 0) : measureDirectory(item),
					});
				} catch {
					// Skipped entry — the classifier simply never sees it.
				}
			}
		}
		const legacySqlite = new Directory(Paths.document, 'SQLite');
		if (legacySqlite.exists) {
			try {
				entries.push({ name: 'SQLite', bytes: measureDirectory(legacySqlite), legacy: true });
			} catch {
				// Legacy remnant unreadable — omit rather than fail the measurement.
			}
		}
		return {
			entries,
			estimateBytes: null,
			estimateDetails: null,
			imageCacheBytes: null,
			opaqueCacheEntries: 0,
		};
	} catch {
		return null;
	}
}
