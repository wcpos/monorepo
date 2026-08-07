import type { SyncObserver } from '@wcpos/sync-core';

import { type EngineTimers, systemTimers } from './engine-timers';
import {
	CENSUS_COLLECTIONS,
	censusNextExpiryMs,
	censusQueryKey,
	type CensusTotals,
	censusTotalsFromCache,
	type QueryTotalCacheEntry,
} from './scheduler';

import type { SyncCollectionName } from './collections/engine-collections';

const CENSUS_READ_RETRY_MS = 1_000;

export type CensusCacheReader<Database = never> = {
	readForQueryKeys(keys: string[], database?: Database): Promise<QueryTotalCacheEntry[] | null>;
};

export type CensusPublisher<Database = never> = {
	subscribe(cb: (totals: CensusTotals) => void): () => void;
	publish(): void;
	totals(): Promise<CensusTotals>;
	freshEntry(
		collection: SyncCollectionName,
		database?: Database
	): Promise<QueryTotalCacheEntry | null>;
	dispose(): void;
};

export function createCensusPublisher<Database = never>(options: {
	cache: CensusCacheReader<Database>;
	now: () => number;
	diagnostics: SyncObserver;
	timers?: EngineTimers;
}): CensusPublisher<Database> {
	const timers = options.timers ?? systemTimers;
	const subscribers = new Set<(totals: CensusTotals) => void>();
	let notificationVersion = 0;
	let expiryTimer: ReturnType<typeof setTimeout> | null = null;
	let disposed = false;
	const readEntries = async (): Promise<QueryTotalCacheEntry[]> =>
		(await options.cache.readForQueryKeys(CENSUS_COLLECTIONS.map(censusQueryKey))) ?? [];
	const totals = async (): Promise<CensusTotals> =>
		censusTotalsFromCache(await readEntries(), options.now());
	const publish = (): void => {
		if (disposed || subscribers.size === 0) return;
		const version = ++notificationVersion;
		void readEntries().then(
			(entries) => {
				if (disposed || version !== notificationVersion) return;
				if (expiryTimer !== null) timers.clearTimeout(expiryTimer);
				const snapshotAtMs = options.now();
				const nextExpiryMs = censusNextExpiryMs(entries, snapshotAtMs);
				expiryTimer =
					nextExpiryMs === null
						? null
						: timers.setTimeout(
								() => {
									expiryTimer = null;
									publish();
								},
								Math.max(0, nextExpiryMs - options.now()) + 1
							);
				const snapshot = censusTotalsFromCache(entries, snapshotAtMs);
				for (const cb of [...subscribers]) {
					try {
						cb(snapshot);
					} catch (error) {
						options.diagnostics({
							type: 'engine.listener-error',
							level: 'error',
							message: `censusChanges() listener threw: ${error instanceof Error ? error.message : String(error)}`,
						});
					}
				}
			},
			(error: unknown) => {
				if (disposed || version !== notificationVersion) return;
				options.diagnostics({
					type: 'engine.listener-error',
					level: 'error',
					message: `censusChanges() cache read failed: ${error instanceof Error ? error.message : String(error)}`,
				});
				if (expiryTimer === null) {
					expiryTimer = timers.setTimeout(() => {
						expiryTimer = null;
						publish();
					}, CENSUS_READ_RETRY_MS);
				}
			}
		);
	};
	return {
		subscribe: (cb) => {
			if (disposed) return () => undefined;
			subscribers.add(cb);
			publish();
			return () => subscribers.delete(cb);
		},
		publish,
		totals,
		freshEntry: async (collection, database) => {
			const [entry] =
				(await options.cache.readForQueryKeys([censusQueryKey(collection)], database)) ?? [];
			return entry !== undefined && entry.freshUntilMs > options.now() ? entry : null;
		},
		dispose: () => {
			if (disposed) return;
			disposed = true;
			if (expiryTimer !== null) timers.clearTimeout(expiryTimer);
			expiryTimer = null;
			subscribers.clear();
		},
	};
}
