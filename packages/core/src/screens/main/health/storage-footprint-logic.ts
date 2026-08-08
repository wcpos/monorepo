// Subpath imports keep this module pure: the package index pulls in the RxDB
// plugin chain, which node-side jest cannot parse and this classifier does not
// need.
import {
	isFastStoreDatabaseName,
	isLegacyAppDatabaseName,
	isStoreDatabaseName,
} from '@wcpos/database/database-names';
import type { StorageFootprintEntry } from '@wcpos/database/measure-storage-types';
import { SYNC_COLLECTION_NAMES } from '@wcpos/sync-engine';

const RXDB_ENTRY_PREFIX = 'rxdb-';
/**
 * Lazy store group anchored on `_c`: store/cashier ids are filename-safe
 * ([a-z0-9-], never '_'), so the first `_c` after `_s` is always the cashier
 * marker even though the raw entry name continues `-<collection>-<version>`.
 */
const SCOPE_ENTRY = /pos_v\d+_([a-f0-9]{12})_s([a-z0-9-]+?)_c/;
const SEARCH_COLLECTION_SUFFIX = '_flexsearch';
const SYNCED_COLLECTIONS: ReadonlySet<string> = new Set(SYNC_COLLECTION_NAMES);

/**
 * Where every measured byte on this device lives, relative to the active
 * store. The buckets are cashier-honest, not storage-honest: "search indexes"
 * and "bookkeeping" describe what the bytes DO, and anything that cannot be
 * attributed stays visibly unattributed instead of silently inflating a
 * bucket.
 */
export type StorageBreakdown = {
	/** The active scope's synced collections — the rows the table itemizes. */
	activeDataBytes: number;
	/** Full-text search collections (`*_flexsearch`) of this store's databases. */
	searchIndexBytes: number;
	/**
	 * The rest of this store's working set: logs, sync bookkeeping, settings,
	 * RxDB internals, and the fast-access mirror of the synced data.
	 */
	bookkeepingBytes: number;
	/** This store, signed in as a different cashier. */
	otherCashiersBytes: number;
	/** Other stores' databases held on this device. */
	otherStoresBytes: number;
	/** Distinct other (site, store) pairs — the "N other stores" number. */
	otherStoresCount: number;
	/**
	 * Data no current sign-in explains: scope databases of signed-out sites
	 * plus previous-generation databases and legacy SQLite remnants.
	 */
	orphanedBytes: number;
	/** Measured entries the classifier could not name. */
	unknownBytes: number;
	/** Every measured byte (all buckets). */
	measuredTotalBytes: number;
};

export type StorageContext = {
	/** Exact database names of the active sign-in (safe-name comparison is done here). */
	activeScopeDbName: string | null;
	storeDbName: string | null;
	fastStoreDbName: string | null;
	userDbName: string | null;
	/** siteHashFor() of every site the user database knows. */
	knownSiteHashes: ReadonlySet<string>;
};

/** RxDB encodes '/' as '__' in on-disk names (products/categories → products__categories). */
const toSafeName = (value: string) => value.replace(/\//g, '__');

/**
 * `rxdb-<db>-<collection>-<version>` → the collection, given the exact db the
 * entry belongs to. Null when the entry is not that db's.
 */
export function collectionFromEntryName(entryName: string, dbName: string): string | null {
	const prefix = `${RXDB_ENTRY_PREFIX}${toSafeName(dbName)}-`;
	if (!entryName.startsWith(prefix)) return null;
	const collectionAndVersion = entryName.slice(prefix.length);
	const versionMatch = collectionAndVersion.match(/-\d+$/);
	if (!versionMatch) return null;
	return collectionAndVersion.slice(0, -versionMatch[0].length).replace(/__/g, '/');
}

function emptyBreakdown(): StorageBreakdown {
	return {
		activeDataBytes: 0,
		searchIndexBytes: 0,
		bookkeepingBytes: 0,
		otherCashiersBytes: 0,
		otherStoresBytes: 0,
		otherStoresCount: 0,
		orphanedBytes: 0,
		unknownBytes: 0,
		measuredTotalBytes: 0,
	};
}

export function classifyStorageEntries(
	entries: readonly StorageFootprintEntry[],
	context: StorageContext
): StorageBreakdown {
	const breakdown = emptyBreakdown();
	const activeScopeMatch = context.activeScopeDbName?.match(SCOPE_ENTRY) ?? null;
	const activeStoreKey = activeScopeMatch ? `${activeScopeMatch[1]}_s${activeScopeMatch[2]}` : null;
	const otherStoreKeys = new Set<string>();

	// This store's databases, each with its own data/search/bookkeeping split.
	// The fast store is a working mirror of the synced data, so ALL of it is
	// bookkeeping — counting it as data would double what the table itemizes.
	const ownDbs = [
		{ name: context.activeScopeDbName, dataCounts: true },
		{ name: context.storeDbName, dataCounts: false },
		{ name: context.fastStoreDbName, dataCounts: false },
		{ name: context.userDbName, dataCounts: false },
	].filter((db): db is { name: string; dataCounts: boolean } => db.name !== null);

	for (const entry of entries) {
		breakdown.measuredTotalBytes += entry.bytes;

		if (entry.legacy) {
			breakdown.orphanedBytes += entry.bytes;
			continue;
		}
		if (!entry.name.startsWith(RXDB_ENTRY_PREFIX)) {
			breakdown.unknownBytes += entry.bytes;
			continue;
		}

		const ownDb = ownDbs.find((db) => collectionFromEntryName(entry.name, db.name) !== null);
		if (ownDb) {
			const collection = collectionFromEntryName(entry.name, ownDb.name)!;
			if (collection.endsWith(SEARCH_COLLECTION_SUFFIX)) {
				breakdown.searchIndexBytes += entry.bytes;
			} else if (ownDb.dataCounts && SYNCED_COLLECTIONS.has(collection)) {
				breakdown.activeDataBytes += entry.bytes;
			} else {
				breakdown.bookkeepingBytes += entry.bytes;
			}
			continue;
		}

		const scopeMatch = entry.name.match(SCOPE_ENTRY);
		if (scopeMatch) {
			const storeKey = `${scopeMatch[1]}_s${scopeMatch[2]}`;
			if (activeStoreKey !== null && storeKey === activeStoreKey) {
				breakdown.otherCashiersBytes += entry.bytes;
			} else if (context.knownSiteHashes.has(scopeMatch[1])) {
				otherStoreKeys.add(storeKey);
				breakdown.otherStoresBytes += entry.bytes;
			} else {
				breakdown.orphanedBytes += entry.bytes;
			}
			continue;
		}

		const dbCandidate = entry.name.slice(RXDB_ENTRY_PREFIX.length);
		if (isLegacyAppDatabaseName(dbCandidate)) {
			breakdown.orphanedBytes += entry.bytes;
			continue;
		}
		if (isStoreDatabaseName(dbCandidate) || isFastStoreDatabaseName(dbCandidate)) {
			// A current-generation store database that is not the signed-in
			// store's — another store's local working set.
			breakdown.otherStoresBytes += entry.bytes;
			continue;
		}
		breakdown.unknownBytes += entry.bytes;
	}

	breakdown.otherStoresCount = otherStoreKeys.size;
	return breakdown;
}

/**
 * The device-quota remainder on platforms with an estimate (web): storage the
 * browser attributes to the app that no measured entry explains — IndexedDB
 * remnants, caches, quota bookkeeping. Null when there is no estimate or the
 * estimate does not exceed what was measured.
 */
export function unattributedBytes(
	estimateBytes: number | null,
	measuredTotalBytes: number
): number | null {
	if (estimateBytes === null || !Number.isFinite(estimateBytes)) return null;
	const remainder = estimateBytes - measuredTotalBytes;
	return remainder > 0 ? remainder : null;
}
