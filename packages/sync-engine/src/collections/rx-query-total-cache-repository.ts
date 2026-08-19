import { createRxKeyedRepository, type RxKeyedCollection } from './rx-keyed-repository';

import type { QueryTotalCacheDocument, QueryTotalCacheEntry } from '../scheduler';

function toDocument(entry: QueryTotalCacheEntry): QueryTotalCacheDocument {
	return { ...entry, schemaVersion: 1 };
}

function fromDocument(document: QueryTotalCacheDocument): QueryTotalCacheEntry {
	const { schemaVersion: _schemaVersion, ...entry } = document;
	return entry;
}

/** Structural: any database carrying the queryTotalCacheEntries collection — any engine scope database satisfies it. */
export type QueryTotalCacheDatabase = {
	queryTotalCacheEntries: RxKeyedCollection<QueryTotalCacheDocument>;
};

type QueryTotalCacheExpiryResult = {
	expired: QueryTotalCacheEntry[];
	failures: { queryKey: string; error: unknown }[];
};

export class RxQueryTotalCacheRepository {
	private readonly keyed;

	constructor(db: QueryTotalCacheDatabase) {
		this.keyed = createRxKeyedRepository({
			collection: db.queryTotalCacheEntries,
			keyOf: (entry: QueryTotalCacheEntry) => entry.queryKey,
			toDocument,
			fromDocument,
		});
	}

	async upsert(entry: QueryTotalCacheEntry): Promise<void> {
		await this.keyed.upsert(entry);
	}

	async readFresh(nowMs: number): Promise<QueryTotalCacheEntry[]> {
		return this.keyed.readMany({
			selector: { freshUntilMs: { $gt: nowMs } },
			sort: [{ queryKey: 'asc' }],
		});
	}

	async readForQueryKeys(queryKeys: string[]): Promise<QueryTotalCacheEntry[]> {
		if (queryKeys.length === 0) return [];
		const requested = new Set(queryKeys);
		const entries = await this.keyed.readMany({
			selector: { queryKey: { $in: [...requested] } },
			sort: [{ queryKey: 'asc' }],
		});
		return entries.filter((entry) => requested.has(entry.queryKey));
	}

	/**
	 * Mark entries stale NOW so the retry lane re-probes them on its next scan.
	 * Only still-fresh entries are rewritten; the total and `updatedAtMs` are
	 * preserved — the entry keeps saying WHAT was counted and WHEN, it just
	 * stops claiming the count is current. Returns completed rewrites and failures.
	 */
	async expire(queryKeys: string[], nowMs: number): Promise<QueryTotalCacheExpiryResult> {
		const entries = await this.readForQueryKeys(queryKeys);
		const expired: QueryTotalCacheEntry[] = [];
		const failures: QueryTotalCacheExpiryResult['failures'] = [];
		for (const entry of entries) {
			if (entry.freshUntilMs <= nowMs) continue;
			const rewritten = { ...entry, freshUntilMs: nowMs };
			try {
				await this.keyed.upsert(rewritten);
				expired.push(rewritten);
			} catch (error) {
				failures.push({ queryKey: entry.queryKey, error });
			}
		}
		return { expired, failures };
	}
}
