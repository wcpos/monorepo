import { Directory, File, Paths } from 'expo-file-system';

import { NATIVE_SQLITE_ROOT } from './adapters/storage/sqlite-root';

import type { StorageFootprint, StorageFootprintEntry } from './measure-storage-types';

export type { StorageFootprint, StorageFootprintEntry } from './measure-storage-types';

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

/** Native SQLite is live; both retired engine roots are aggregate legacy entries. */
export async function measureAppStorage(): Promise<StorageFootprint | null> {
	try {
		const entries: StorageFootprintEntry[] = [];
		for (const directory of [
			NATIVE_SQLITE_ROOT,
			new Directory(Paths.document, '.expo-opfs'),
			new Directory(Paths.document, 'SQLite'),
		]) {
			if (!directory.exists) continue;
			try {
				entries.push({
					name: directory.name,
					bytes: measureDirectory(directory),
					...(directory === NATIVE_SQLITE_ROOT ? { root: 'sqlite' as const } : { legacy: true }),
				});
			} catch {
				// One unreadable root must not hide the other roots' footprint.
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
