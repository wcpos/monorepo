import { measureCacheStorage } from './measure-cache-storage';

import type { StorageFootprint, StorageFootprintEntry } from './measure-storage-types';

export type { StorageFootprint, StorageFootprintEntry } from './measure-storage-types';

const RXDB_DIRECTORY_PREFIX = 'rxdb-';

/** Structural OPFS types — lib.dom's are incomplete for async iteration. */
type OpfsFileHandle = { kind: 'file'; getFile(): Promise<{ size: number }> };
type OpfsDirectoryHandle = {
	kind: 'directory';
	values(): AsyncIterable<OpfsFileHandle | OpfsDirectoryHandle>;
	entries(): AsyncIterable<[string, OpfsFileHandle | OpfsDirectoryHandle]>;
};
type StorageEstimateWithDetails = StorageEstimate & { usageDetails?: Record<string, number> };

async function measureDirectory(handle: OpfsDirectoryHandle): Promise<number> {
	let bytes = 0;
	for await (const child of handle.values()) {
		if (child.kind === 'file') {
			bytes += (await child.getFile()).size;
		} else {
			bytes += await measureDirectory(child);
		}
	}
	return bytes;
}

/**
 * Web: enumerate the OPFS root's `rxdb-` collection directories (the worker
 * storage writes one per (database, collection, version)), alongside the
 * device-quota estimate retained as browser accounting context.
 */
export async function measureAppStorage(): Promise<StorageFootprint | null> {
	const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
	if (!storage) return null;

	let estimateBytes: number | null = null;
	let estimateDetails: Record<string, number> | null = null;
	try {
		const estimate = (await storage.estimate()) as StorageEstimateWithDetails;
		estimateBytes = estimate.usage ?? null;
		estimateDetails = estimate.usageDetails ?? null;
	} catch {
		// Quota API unavailable — the entries alone still tell most of the story.
	}

	const entries: StorageFootprintEntry[] = [];
	try {
		const root = (await (
			storage as unknown as { getDirectory(): Promise<OpfsDirectoryHandle> }
		).getDirectory()) as OpfsDirectoryHandle;
		for await (const [name, handle] of root.entries()) {
			if (!name.startsWith(RXDB_DIRECTORY_PREFIX) || handle.kind !== 'directory') continue;
			// Failures isolate per entry: one unreadable directory must not hide
			// every other database's footprint.
			try {
				entries.push({ name, bytes: await measureDirectory(handle) });
			} catch {
				// Skipped entry — the classifier simply never sees it.
			}
		}
	} catch {
		// OPFS enumeration unavailable (permissions, platform); the estimate may
		// still be present, so return what was measured.
	}

	const cacheStorage = await measureCacheStorage();
	if (entries.length === 0 && estimateBytes === null && cacheStorage === null) return null;
	return {
		entries,
		estimateBytes,
		estimateDetails,
		imageCacheBytes: cacheStorage?.imageCacheBytes ?? null,
		opaqueCacheEntries: cacheStorage?.opaqueCacheEntries ?? 0,
	};
}
