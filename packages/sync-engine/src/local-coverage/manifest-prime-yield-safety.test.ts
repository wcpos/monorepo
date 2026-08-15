// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
	type ExistenceManifestPrimeDatabase,
	primeExistenceManifest,
	runManifestPrimePass,
	runSingleLanePrimePass,
} from './manifest';

/**
 * Regression cover for the window the boot prime's chunked classification opens (#949 tranche 2).
 *
 * The classification pass now yields to the event loop, so a cashier can start editing a product
 * AFTER it has been classified as clean-and-unpublished but BEFORE the removal runs. RxDocuments
 * are immutable snapshots, so the classified instance can never show that edit — only a keyed
 * re-read can. Without that re-read the prime deletes un-pushed local work.
 */

type ProductRow = {
	primary: string;
	wooProductId?: number | null;
	payload?: { status?: unknown };
	local?: { dirty?: boolean; pendingMutationIds?: unknown[] };
};

const product = (
	wooProductId: number,
	status: string,
	local: ProductRow['local'] = {}
): ProductRow => ({
	primary: `p-${wooProductId}`,
	wooProductId,
	payload: { status },
	local,
});

/** A fake prime database whose findByIds can report state that differs from the find() snapshot. */
function primeDatabase(input: {
	products: ProductRow[];
	/** Current state at removal time, keyed by primary; defaults to the snapshot. */
	currentProducts?: ProductRow[];
	bulkRemove: (ids: string[]) => void;
}): ExistenceManifestPrimeDatabase {
	const emptyCollection = {
		count: () => ({ exec: async () => 0 }),
		find: () => ({ exec: async () => [] }),
	};
	const currentById = new Map(
		(input.currentProducts ?? input.products).map((row) => [row.primary, row])
	);
	return {
		existenceManifest: {
			bulkUpsert: async () => [],
			bulkRemove: async () => [],
			count: () => ({ exec: async () => 0 }),
			find: () => ({ exec: async () => [] }),
		},
		existenceManifestCustomers: {
			bulkUpsert: async () => [],
			bulkRemove: async () => [],
			count: () => ({ exec: async () => 0 }),
			find: () => ({ exec: async () => [] }),
		},
		existenceManifestOrders: {
			bulkUpsert: async () => [],
			bulkRemove: async () => [],
			count: () => ({ exec: async () => 0 }),
			find: () => ({ exec: async () => [] }),
		},
		products: {
			count: () => ({ exec: async () => input.products.length }),
			find: () => ({ exec: async () => input.products }),
			findByIds: (ids: string[]) => ({
				exec: async () =>
					new Map(
						ids.flatMap((id) => {
							const row = currentById.get(id);
							return row ? ([[id, row]] as [string, ProductRow][]) : [];
						})
					),
			}),
			bulkRemove: async (ids: string[]) => {
				input.bulkRemove(ids);
				return [];
			},
		},
		variations: emptyCollection,
		customers: emptyCollection,
		orders: emptyCollection,
	} as unknown as ExistenceManifestPrimeDatabase;
}

/** Echoes a digest for every requested id, so every primed id lands a manifest row. */
function digestFetcher() {
	return vi.fn(async (url: string) => {
		const ids = (new URL(url, 'https://x.test').searchParams.get('include') ?? '')
			.split(',')
			.filter(Boolean)
			.map(Number);
		return {
			ok: true,
			status: 200,
			json: async () => ({
				digests: ids.map((id) => ({ id, digest: `d-${id}` })),
			}),
		};
	});
}

async function runPrime(db: ExistenceManifestPrimeDatabase) {
	const rows: number[] = [];
	const fetcher = digestFetcher();
	const primed = await primeExistenceManifest(db, {
		fetcher: fetcher as never,
		syncBaseUrl: 'https://x.test/wp-json/wcpos/v2',
	});
	for (const call of fetcher.mock.calls) {
		for (const id of (new URL(call[0], 'https://x.test').searchParams.get('include') ?? '')
			.split(',')
			.filter(Boolean)) {
			rows.push(Number(id));
		}
	}
	return { primed, requestedIds: rows };
}

describe('primeExistenceManifest removal safety across yields (#949)', () => {
	it('limits one prime pass to five 100-id digest chunks and resumes with the first remaining ids', async () => {
		const existing = new Set<number>();
		const requested: number[][] = [];
		const input = {
			productWooIds: Array.from({ length: 601 }, (_unused, index) => index + 1),
			variationWooIds: [],
			existingManifestWooIds: existing,
			fetchDigests: async (ids: number[]) => {
				requested.push(ids);
				return ids.map((id) => ({ id, digest: String(id) }));
			},
			upsert: async (rows: { wooId: number }[]) => {
				for (const row of rows) existing.add(row.wooId);
			},
		};

		await expect(runManifestPrimePass(input)).resolves.toBe(500);
		expect(requested).toHaveLength(5);
		expect(requested.flat()).toEqual(Array.from({ length: 500 }, (_unused, index) => index + 1));

		await expect(runManifestPrimePass(input)).resolves.toBe(101);
		expect(requested.slice(5).flat()).toEqual(
			Array.from({ length: 101 }, (_unused, index) => index + 501)
		);
	});

	it('rotates past ids whose digest lookup returns nothing instead of starving the tail (codex P1)', async () => {
		// 601 resident ids, and the server knows NONE of them (e.g. deleted server-side):
		// every pass primes zero rows. Without rotation each tick would retry ids 1..500
		// forever; the persisted last-ATTEMPTED cursor must advance the window regardless.
		const requested: number[][] = [];
		let cursor = -1;
		const input = {
			productWooIds: Array.from({ length: 601 }, (_unused, index) => index + 1),
			variationWooIds: [],
			existingManifestWooIds: new Set<number>(),
			fetchDigests: async (ids: number[]) => {
				requested.push(ids);
				return [];
			},
			upsert: async () => {},
		};
		const rotation = () => ({
			afterWooId: cursor,
			commit: async (lastAttempted: number) => {
				cursor = lastAttempted;
			},
		});

		await expect(runManifestPrimePass({ ...input, rotation: rotation() })).resolves.toBe(0);
		expect(requested.flat()).toEqual(Array.from({ length: 500 }, (_unused, index) => index + 1));
		expect(cursor).toBe(500);

		await expect(runManifestPrimePass({ ...input, rotation: rotation() })).resolves.toBe(0);
		const secondPass = requested.slice(5).flat();
		// Resumes past the cursor (501..601), then wraps to the low ids — the tail is reached
		// and the budget circulates instead of pinning to the first five chunks.
		expect(secondPass[0]).toBe(501);
		expect(secondPass).toContain(601);
		expect(secondPass).toContain(1);
		expect(cursor).toBe(399);
	});

	it('rotates past a batch whose digest fetch THROWS instead of retrying it forever (codex round 2)', async () => {
		let cursor = -1;
		const attempted: number[][] = [];
		const input = {
			productWooIds: Array.from({ length: 200 }, (_unused, index) => index + 1),
			variationWooIds: [],
			existingManifestWooIds: new Set<number>(),
			fetchDigests: async (ids: number[]) => {
				attempted.push(ids);
				// The first window is poisoned: it always rejects.
				if (ids[0]! <= 100) throw new Error('boom');
				return ids.map((id) => ({ id, digest: String(id) }));
			},
			upsert: async () => {},
			rotation: {
				get afterWooId() {
					return cursor;
				},
				commit: async (lastAttempted: number) => {
					cursor = lastAttempted;
				},
			},
		};

		await expect(runManifestPrimePass(input)).rejects.toThrow('boom');
		// The poisoned batch still advanced the cursor — the next tick opens PAST it.
		expect(cursor).toBe(100);
		await expect(runManifestPrimePass({ ...input, chunkBudget: { remaining: 1 } })).resolves.toBe(
			100
		);
		expect(attempted[1]![0]).toBe(101);
	});

	it('prunes explicit deletions, ignores stray deleted ids, and advances rotation', async () => {
		const pruned: number[][] = [];
		const upserted: { wooId: number }[][] = [];
		let cursor = -1;

		await expect(
			runSingleLanePrimePass({
				wooIds: [10, 11],
				objectType: 'customer',
				existingManifestWooIds: new Set(),
				fetchDigests: async () => [
					{ id: 10, deleted: true },
					{ id: 11, digest: 'd-11' },
					{ id: 999, deleted: true },
				],
				upsert: async (rows) => {
					upserted.push(rows);
				},
				pruneDeleted: async (wooIds) => {
					pruned.push(wooIds);
				},
				rotation: {
					afterWooId: cursor,
					commit: async (lastAttempted) => {
						cursor = lastAttempted;
					},
				},
			})
		).resolves.toBe(1);

		expect(pruned).toEqual([[10]]);
		expect(upserted).toEqual([[{ id: '11', wooId: 11, objectType: 'customer', digest: 'd-11' }]]);
		expect(cursor).toBe(11);
	});

	it('keeps old-server digest-only responses on the existing upsert path', async () => {
		const pruned = vi.fn();
		const upsert = vi.fn();

		await expect(
			runSingleLanePrimePass({
				wooIds: [20],
				objectType: 'order',
				existingManifestWooIds: new Set(),
				fetchDigests: async () => [{ id: 20, digest: 'old-server' }],
				upsert,
				pruneDeleted: pruned,
			})
		).resolves.toBe(1);

		expect(pruned).not.toHaveBeenCalled();
		expect(upsert).toHaveBeenCalledWith([
			{ id: '20', wooId: 20, objectType: 'order', digest: 'old-server' },
		]);
	});

	it('does NOT delete a product that gained local work after it was classified', async () => {
		const removed: string[][] = [];
		const db = primeDatabase({
			// Snapshot: 7 is unpublished and clean, so it is classified for removal.
			products: [product(7, 'draft'), product(8, 'publish')],
			// By removal time the cashier has an un-pushed edit queued against it.
			currentProducts: [product(7, 'draft', { dirty: true }), product(8, 'publish')],
			bulkRemove: (ids) => removed.push(ids),
		});

		const { requestedIds } = await runPrime(db);

		expect(removed).toEqual([]); // the un-pushed edit survived
		// It stays resident, so it belongs in the primed set exactly like any other resident.
		expect(requestedIds.sort()).toEqual([7, 8]);
	});

	it('does NOT delete a product that got published after it was classified', async () => {
		const removed: string[][] = [];
		const db = primeDatabase({
			products: [product(7, 'draft')],
			currentProducts: [product(7, 'publish')],
			bulkRemove: (ids) => removed.push(ids),
		});

		const { requestedIds } = await runPrime(db);

		expect(removed).toEqual([]);
		expect(requestedIds).toEqual([7]);
	});

	it('still deletes a product that is genuinely unpublished and clean at removal time', async () => {
		const removed: string[][] = [];
		const db = primeDatabase({
			products: [product(7, 'draft'), product(8, 'publish')],
			bulkRemove: (ids) => removed.push(ids),
		});

		const { requestedIds } = await runPrime(db);

		expect(removed).toEqual([['p-7']]);
		expect(requestedIds).toEqual([8]); // the removed product is not primed
	});

	it('leaves an unpublished product alone when it already carried pending local work', async () => {
		const removed: string[][] = [];
		const db = primeDatabase({
			products: [product(7, 'draft', { pendingMutationIds: ['m1'] })],
			bulkRemove: (ids) => removed.push(ids),
		});

		const { requestedIds } = await runPrime(db);

		expect(removed).toEqual([]);
		expect(requestedIds).toEqual([7]);
	});
});
