import { describe, expect, it } from 'vitest';

import { RxQueryTotalCacheRepository } from './rx-query-total-cache-repository';

import type { QueryTotalCacheEntry } from '../scheduler';

type StoredEntry = QueryTotalCacheEntry & { schemaVersion: 1 };

/** In-memory stand-in for the queryTotalCacheEntries collection — just enough
 * of find/bulkUpsert/findOne/incrementalModify for readForQueryKeys/expire. */
function fakeDatabase(
	seed: QueryTotalCacheEntry[],
	beforeModify?: (queryKey: string, entries: Map<string, StoredEntry>) => void
) {
	const byKey = new Map<string, StoredEntry>(
		seed.map((entry) => [entry.queryKey, { ...entry, schemaVersion: 1 }])
	);
	const collection = {
		find: (query?: { selector?: { queryKey?: { $in?: string[] } } }) => ({
			exec: async () => {
				const requested = query?.selector?.queryKey?.$in;
				return [...byKey.values()].filter(
					(document) => requested === undefined || requested.includes(document.queryKey)
				);
			},
		}),
		bulkUpsert: async (documents: StoredEntry[]) => {
			for (const document of documents) byKey.set(document.queryKey, document);
			return { success: documents, error: [] };
		},
		findOne: (queryKey: string) => ({
			exec: async () => {
				if (!byKey.has(queryKey)) return null;
				return {
					toJSON: () => byKey.get(queryKey),
					incrementalModify: async (modify: (document: StoredEntry) => StoredEntry) => {
						beforeModify?.(queryKey, byKey);
						const current = byKey.get(queryKey);
						if (current) byKey.set(queryKey, modify(current));
					},
				};
			},
		}),
	};
	return { byKey, database: { queryTotalCacheEntries: collection as never } };
}

function entry(
	queryKey: string,
	overrides: Partial<QueryTotalCacheEntry> = {}
): QueryTotalCacheEntry {
	return {
		queryKey,
		totalMatchingRecords: 203,
		freshUntilMs: 10_000,
		updatedAtMs: 1_000,
		...overrides,
	};
}

describe('RxQueryTotalCacheRepository.expire', () => {
	it('rewrites only still-fresh entries to expire now, preserving total and updatedAtMs', async () => {
		const { byKey, database } = fakeDatabase([
			entry('census:products', { freshUntilMs: 10_000 }),
			entry('census:customers', { freshUntilMs: 3_000, totalMatchingRecords: 5_478 }),
		]);
		const repository = new RxQueryTotalCacheRepository(database as never);

		const result = await repository.expire(['census:products', 'census:customers'], 5_000);

		expect(result).toEqual({
			expired: [
				{
					queryKey: 'census:products',
					totalMatchingRecords: 203,
					freshUntilMs: 5_000,
					updatedAtMs: 1_000,
				},
			],
			failures: [],
		});
		expect(byKey.get('census:products')?.freshUntilMs).toBe(5_000);
		expect(byKey.get('census:products')?.totalMatchingRecords).toBe(203);
		expect(byKey.get('census:products')?.updatedAtMs).toBe(1_000);
		// Already stale — untouched.
		expect(byKey.get('census:customers')?.freshUntilMs).toBe(3_000);
	});

	it('ignores unknown keys and expires nothing for an empty key list', async () => {
		const { byKey, database } = fakeDatabase([entry('census:products')]);
		const repository = new RxQueryTotalCacheRepository(database as never);

		await expect(repository.expire(['census:orders'], 5_000)).resolves.toEqual({
			expired: [],
			failures: [],
		});
		await expect(repository.expire([], 5_000)).resolves.toEqual({
			expired: [],
			failures: [],
		});
		expect(byKey.get('census:products')?.freshUntilMs).toBe(10_000);
	});

	it('preserves a fresh recount written after the expiry read', async () => {
		const freshRecount = entry('census:products', {
			totalMatchingRecords: 204,
			freshUntilMs: 20_000,
			updatedAtMs: 2_000,
		});
		const { byKey, database } = fakeDatabase([entry('census:products')], (queryKey, entries) => {
			entries.set(queryKey, { ...freshRecount, schemaVersion: 1 });
		});
		const repository = new RxQueryTotalCacheRepository(database as never);

		await expect(repository.expire(['census:products'], 5_000)).resolves.toEqual({
			expired: [],
			failures: [],
		});
		expect(byKey.get('census:products')).toEqual({ ...freshRecount, schemaVersion: 1 });
	});
});
