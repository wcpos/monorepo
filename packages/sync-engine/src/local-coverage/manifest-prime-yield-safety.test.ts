// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
	type ExistenceManifestPrimeDatabase,
	primeExistenceManifest,
	runManifestPrimePass,
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
