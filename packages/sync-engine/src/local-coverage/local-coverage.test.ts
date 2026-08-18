// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { remoteId } from '../testing';
import {
	createLocalCoverage,
	type CreateLocalCoverageOptions,
	type LocalCoverage,
	PRIME_FORCE_COUNTER_KEY,
} from './local-coverage';

import type { CoverageDatabase } from './persistence';
import type { CoverageCompactionFailureDatabase } from './rx-coverage-compaction-failure-repository';
import type { CoverageCompactionLeaseDatabase } from './rx-coverage-compaction-lease-repository';

type Stored = Record<string, unknown> & { _deleted?: boolean };

function memoryCollection(key: string, options: { conflictOnce?: boolean } = {}) {
	const documents = new Map<string, Stored>();
	let conflictOnce = options.conflictOnce ?? false;
	const wrapped = (id: string, value: Stored) => ({
		...value,
		toJSON: () => documents.get(id) ?? value,
		incrementalModify: async (modify: (current: Stored) => Stored) => {
			const next = modify(documents.get(id) ?? value);
			if (next._deleted) documents.delete(id);
			else documents.set(id, next);
			return next;
		},
	});
	return {
		documents,
		bulkUpsert: vi.fn(async (items: Stored[]) =>
			items.forEach((item) => documents.set(String(item[key]), item))
		),
		insert: vi.fn(async (item: Stored) => {
			const id = String(item[key]);
			if (conflictOnce) {
				conflictOnce = false;
				documents.set(id, {
					...item,
					coveredQueryKeys: ['orders:concurrent'],
					freshUntilMs: 9_000,
					updatedAtMs: 2_000,
				});
				throw Object.assign(new Error('conflict'), { code: 'CONFLICT' });
			}
			documents.set(id, item);
			return wrapped(id, item);
		}),
		find: vi.fn(() => ({
			exec: async () => [...documents].map(([id, value]) => wrapped(id, value)),
		})),
		findOne: vi.fn((id: string) => ({
			exec: async () => {
				const value = documents.get(id);
				return value ? wrapped(id, value) : null;
			},
		})),
	};
}

function coverageDatabase(options: { recordConflictOnce?: boolean } = {}) {
	return {
		coverageRecords: memoryCollection('coverageKey', {
			conflictOnce: options.recordConflictOnce,
		}),
		coverageLanes: memoryCollection('laneKey'),
	};
}

describe('LocalCoverage interface', () => {
	it('requires compaction stores and all manifest stores when manifest priming is enabled', () => {
		const coverageOnlyDatabase = coverageDatabase() as unknown as CoverageDatabase;
		const missingCompactionStores: CreateLocalCoverageOptions = {
			// @ts-expect-error compaction maintenance is always exposed, so its stores are required.
			database: coverageOnlyDatabase,
			freshForMs: 1,
		};
		const compactionDatabase = coverageOnlyDatabase as CoverageDatabase &
			CoverageCompactionLeaseDatabase &
			CoverageCompactionFailureDatabase;
		// @ts-expect-error enabling manifest priming requires every manifest collection.
		const missingManifestStores: CreateLocalCoverageOptions = {
			database: compactionDatabase,
			freshForMs: 1,
			manifest: { fetcher: vi.fn(), syncBaseUrl: 'https://example.test/sync' },
		};

		expect([missingCompactionStores, missingManifestStores]).toHaveLength(2);
	});

	it('constructs one coverage home without exposing persistence policy on operations', async () => {
		const database = coverageDatabase();
		const coverage: LocalCoverage = createLocalCoverage({
			database: database as never,
			now: () => 1_000,
			freshForMs: 500,
		});

		await coverage.recordQueryResult({
			collection: 'orders',
			queryKey: 'orders:open',
			records: [{ id: 'woo-order:1' }],
			complete: true,
		});

		await expect(coverage.readRecord('orders', 'woo-order:1')).resolves.toEqual({
			collection: 'orders',
			id: 'woo-order:1',
			fresh: true,
		});
		await expect(coverage.readLane('orders', 'orders:open')).resolves.toEqual({
			collection: 'orders',
			queryKey: 'orders:open',
			complete: true,
			fresh: true,
			expectedRecordIds: ['woo-order:1'],
		});
	});

	it('lets an explicit marker-precedence timestamp beat a complete marker under a fixed clock', async () => {
		const coverage = createLocalCoverage({
			database: coverageDatabase() as never,
			now: () => 1_000,
			freshForMs: 500,
		});

		await coverage.recordQueryResult({
			collection: 'orders',
			queryKey: 'orders:baseline-in-progress',
			records: [],
			complete: true,
		});
		await coverage.recordQueryResult({
			collection: 'orders',
			queryKey: 'orders:baseline-in-progress',
			records: [],
			complete: false,
			nowMs: 1_001,
			freshForMs: 0,
		});

		await expect(coverage.readLane('orders', 'orders:baseline-in-progress')).resolves.toEqual(
			expect.objectContaining({
				complete: false,
			})
		);
	});

	it('retains the newest concurrent record winner and merges both query memberships after an insert CAS conflict', async () => {
		const database = coverageDatabase({ recordConflictOnce: true });
		const times = [1_000, 3_000];
		const coverage = createLocalCoverage({
			database: database as never,
			now: () => times.shift() ?? 3_000,
			freshForMs: 500,
		});

		await Promise.all([
			coverage.recordQueryResult({
				collection: 'orders',
				queryKey: 'orders:query',
				records: [{ id: 'order-1' }],
				complete: true,
			}),
			coverage.recordRecords({
				collection: 'orders',
				queryKey: 'orders:requested',
				records: [{ id: 'order-1' }],
			}),
		]);

		expect(database.coverageRecords.documents.get('orders::order-1')).toMatchObject({
			coveredQueryKeys: ['orders:requested', 'orders:query'],
			freshUntilMs: 3_500,
			updatedAtMs: 3_000,
		});
	});

	it('advances the persisted prime force counter each primeManifest tick', async () => {
		const database = coverageDatabase() as ReturnType<typeof coverageDatabase> &
			Record<string, unknown>;
		const zeroCollection = {
			count: () => ({ exec: async () => 0 }),
			find: () => ({ exec: async () => [] }),
		};
		Object.assign(database, {
			existenceManifest: { ...memoryCollection('id'), ...zeroCollection },
			existenceManifestCustomers: { ...memoryCollection('id'), ...zeroCollection },
			existenceManifestOrders: { ...memoryCollection('id'), ...zeroCollection },
			products: zeroCollection,
			variations: zeroCollection,
			customers: zeroCollection,
			orders: zeroCollection,
		});
		const cursors = new Map<string, string>();
		const coverage = createLocalCoverage({
			database: database as never,
			freshForMs: 1,
			manifest: { fetcher: vi.fn(), syncBaseUrl: 'https://example.test/sync' },
			reconcileCursorStore: {
				get: async (key) => cursors.get(key) ?? null,
				set: async (key, value) => void cursors.set(key, value),
			},
		});

		await coverage.primeManifest();
		expect(cursors.get(PRIME_FORCE_COUNTER_KEY)).toBe('1');
		await coverage.primeManifest();
		expect(cursors.get(PRIME_FORCE_COUNTER_KEY)).toBe('2');
	});

	it('bounds manifest chunks while filtering stray, existing, and local-only ids', async () => {
		const database = coverageDatabase() as ReturnType<typeof coverageDatabase> &
			Record<string, unknown>;
		const manifest = memoryCollection('id');
		manifest.documents.set('2', {
			id: '2',
			wooId: 2,
			objectType: 'product',
			digest: 'existing',
		});
		Object.assign(database, {
			existenceManifest: {
				...manifest,
				count: () => ({ exec: async () => manifest.documents.size }),
			},
			existenceManifestCustomers: {
				...memoryCollection('id'),
				count: () => ({ exec: async () => 0 }),
			},
			existenceManifestOrders: {
				...memoryCollection('id'),
				count: () => ({ exec: async () => 0 }),
			},
			products: {
				count: () => ({ exec: async () => 4 }),
				find: () => ({
					exec: async () => [
						{ remoteId: remoteId(1), payload: { status: 'publish' } },
						{ remoteId: remoteId(2), payload: { status: 'publish' } },
						{ remoteId: null },
						{ remoteId: undefined },
					],
				}),
			},
			variations: {
				count: () => ({ exec: async () => 2 }),
				find: () => ({ exec: async () => [{ remoteId: remoteId(3) }, { remoteId: remoteId(4) }] }),
			},
			customers: {
				count: () => ({ exec: async () => 0 }),
				find: () => ({ exec: async () => [] }),
			},
			orders: {
				count: () => ({ exec: async () => 0 }),
				find: () => ({ exec: async () => [] }),
			},
		});
		const fetcher = vi.fn(async (url: string) => {
			const ids = new URL(url).searchParams.get('include')?.split(',').map(Number) ?? [];
			return {
				ok: true,
				status: 200,
				json: async () => ({
					digests: [
						...ids.map((id) => ({
							id,
							digest: id === 4 ? '' : `digest-${id}`,
						})),
						{ id: 999, digest: 'stray' },
					],
				}),
			};
		});
		const coverage = createLocalCoverage({
			database: database as never,
			freshForMs: 1,
			manifest: {
				fetcher,
				syncBaseUrl: 'https://example.test/sync',
				chunkSize: 2,
			},
		});

		await expect(coverage.primeManifest(undefined, { maxChunks: 1 })).resolves.toEqual({
			products: 2,
			customers: 0,
			orders: 0,
		});
		expect(fetcher.mock.calls.map(([url]) => new URL(url).searchParams.get('include'))).toEqual([
			'1,3',
		]);
		fetcher.mockClear();
		await expect(coverage.primeManifest()).resolves.toEqual({
			products: 0,
			customers: 0,
			orders: 0,
		});
		expect(fetcher.mock.calls.map(([url]) => new URL(url).searchParams.get('include'))).toEqual([
			'4',
		]);
		expect(
			[...manifest.documents.values()].map(({ wooId, digest, objectType }) => ({
				wooId,
				digest,
				objectType,
			}))
		).toEqual([
			{ wooId: 2, digest: 'existing', objectType: 'product' },
			{ wooId: 1, digest: 'digest-1', objectType: 'product' },
			{ wooId: 3, digest: 'digest-3', objectType: 'variation' },
		]);
	});

	it('plans and dispatches a prune-only reconcile pass while reporting coverage gaps', async () => {
		const deleteProducts = vi.fn(async () => undefined);
		const coverage = createLocalCoverage({
			database: coverageDatabase() as never,
			freshForMs: 1,
			reconcile: {
				bucketSize: 100,
				occupiedBucketIndexes: async () => [0],
				readManifestRange: async () => [
					{ id: '10', wooId: 10, objectType: 'product', digest: '1' },
					{ id: '20', wooId: 20, objectType: 'product', digest: '2' },
				],
				dirtyWooIds: async () => new Set([20]),
				fetchServerScanPage: async () => ({
					changes: [
						{
							bucket: 0,
							storedCount: 2,
							currentCount: 1,
							storedDigest: '3',
							currentDigest: '3',
							match: false,
						},
					],
					nextAfterId: 100,
					complete: true,
				}),
				fetchServerBucket: async () => [{ id: 30, objectType: 'product', digest: '3' }],
				deleteProducts,
				deleteVariations: vi.fn(async () => undefined),
			},
		});

		await expect(coverage.reconcilePass()).resolves.toEqual({
			buckets: 1,
			emptyBuckets: 0,
			pruned: 1,
			missing: 1,
			changed: 0,
			skippedDirty: 1,
		});
		expect(deleteProducts).toHaveBeenCalledWith([10]);
	});

	it('skips a clean manifest bucket after the aggregate scan', async () => {
		const fetchServerBucket = vi.fn(async () => []);
		const coverage = createLocalCoverage({
			database: coverageDatabase() as never,
			freshForMs: 1,
			reconcile: {
				bucketSize: 100,
				occupiedBucketIndexes: async () => [0],
				readManifestRange: async () => [
					{
						id: '10',
						wooId: 10,
						objectType: 'product',
						digest: '9007199254740992',
					},
				],
				dirtyWooIds: async () => new Set<number>(),
				fetchServerScanPage: async () => ({
					changes: [
						{
							bucket: 0,
							storedCount: 1,
							currentCount: 1,
							storedDigest: '9007199254740992',
							currentDigest: '9007199254740992',
							match: true,
						},
					],
					nextAfterId: 100,
					complete: true,
				}),
				fetchServerBucket,
				deleteProducts: vi.fn(async () => undefined),
				deleteVariations: vi.fn(async () => undefined),
			},
		});

		await expect(coverage.reconcilePass()).resolves.toMatchObject({
			buckets: 0,
			pruned: 0,
		});
		expect(fetchServerBucket).not.toHaveBeenCalled();
	});

	it('resumes five candidates as 2/2/1 drill-downs across ticks', async () => {
		const fetchedBuckets: number[] = [];
		const cursorState = new Map<string, string>();
		const buckets = [0, 1, 2, 3, 4];
		const coverage = createLocalCoverage({
			database: coverageDatabase() as never,
			freshForMs: 1,
			reconcileCursorStore: {
				get: async (key) => cursorState.get(key) ?? null,
				set: async (key, value) => void cursorState.set(key, value),
			},
			reconcile: {
				bucketSize: 100,
				occupiedBucketIndexes: async () => buckets,
				readManifestRange: async (lo) => [
					{
						id: String(lo + 1),
						wooId: lo + 1,
						objectType: 'product',
						digest: String(lo / 100 + 1),
					},
				],
				dirtyWooIds: async () => new Set<number>(),
				fetchServerScanPage: async () => ({
					changes: buckets.map((bucket) => ({
						bucket,
						storedCount: 1,
						currentCount: 0,
						storedDigest: String(bucket + 1),
						currentDigest: '0',
						match: false,
					})),
					nextAfterId: 500,
					complete: true,
				}),
				fetchServerBucket: async (bucket) => {
					fetchedBuckets.push(bucket);
					return [];
				},
				deleteProducts: vi.fn(async () => undefined),
				deleteVariations: vi.fn(async () => undefined),
			},
		});

		await coverage.reconcilePass();
		expect(fetchedBuckets).toEqual([0, 1]);
		await coverage.reconcilePass();
		expect(fetchedBuckets).toEqual([0, 1, 2, 3]);
		await coverage.reconcilePass();
		// The fixture keeps every bucket dirty, so after 4 the cursor WRAPS and spends the
		// tick's spare budget on the still-dirty bucket 0 — per-port wrapping (codex
		// r3760800575) trades idle budget for continued convergence, always within K=2/tick.
		expect(fetchedBuckets).toEqual([0, 1, 2, 3, 4, 0]);
	});

	it('bounds scan pages and drill-downs for a reduced reconcile pass', async () => {
		const fetchServerScanPage = vi.fn(async () => ({
			changes: [],
			nextAfterId: 99,
			complete: false,
		}));
		const fetchServerBucket = vi.fn(async () => []);
		const coverage = createLocalCoverage({
			database: coverageDatabase() as never,
			freshForMs: 1,
			reconcile: {
				bucketSize: 100,
				occupiedBucketIndexes: async () => [0, 1, 2],
				readManifestRange: async (lo) => [
					{
						id: String(lo + 1),
						wooId: lo + 1,
						objectType: 'product',
						digest: '1',
					},
				],
				dirtyWooIds: async () => new Set<number>(),
				fetchServerScanPage,
				fetchServerBucket,
				deleteProducts: vi.fn(async () => undefined),
				deleteVariations: vi.fn(async () => undefined),
			},
		});

		await coverage.reconcilePass(undefined, undefined, undefined, {
			maxScanPagesPerSpace: 1,
			maxDrillDowns: 1,
		});

		expect(fetchServerScanPage).toHaveBeenCalledOnce();
		expect(fetchServerBucket).toHaveBeenCalledOnce();
	});

	it('fails closed when a scan page fails', async () => {
		const fetchServerBucket = vi.fn(async () => []);
		const coverage = createLocalCoverage({
			database: coverageDatabase() as never,
			freshForMs: 1,
			reconcile: {
				bucketSize: 100,
				occupiedBucketIndexes: async () => [0],
				readManifestRange: async () => [{ id: '1', wooId: 1, objectType: 'product', digest: '1' }],
				dirtyWooIds: async () => new Set<number>(),
				fetchServerScanPage: async () => {
					throw new Error('scan exploded');
				},
				fetchServerBucket,
				deleteProducts: vi.fn(async () => undefined),
				deleteVariations: vi.fn(async () => undefined),
			},
		});

		await expect(coverage.reconcilePass()).rejects.toThrow(/scan exploded/);
		expect(fetchServerBucket).not.toHaveBeenCalled();
	});

	it('waits for every id-space reconcile before reporting aggregated failures', async () => {
		let releaseSlow!: () => void;
		const slowGate = new Promise<void>((resolve) => {
			releaseSlow = resolve;
		});
		let slowCompleted = false;
		const port = (occupiedBucketIndexes: () => Promise<readonly number[]>) => ({
			bucketSize: 100,
			occupiedBucketIndexes,
			readManifestRange: async () => [],
			dirtyWooIds: async () => new Set<number>(),
			fetchServerScanPage: async () => ({
				changes: [],
				nextAfterId: 0,
				complete: true,
			}),
			fetchServerBucket: async () => [],
			deleteProducts: async () => undefined,
			deleteVariations: async () => undefined,
		});
		const coverage = createLocalCoverage({
			database: coverageDatabase() as never,
			freshForMs: 1,
			reconcile: [
				port(async () => {
					throw new Error('products failed fast');
				}),
				port(async () => {
					await slowGate;
					slowCompleted = true;
					return [];
				}),
			],
		});

		const pass = coverage.reconcilePass();
		let settled = false;
		void pass
			.catch(() => undefined)
			.then(() => {
				settled = true;
			});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(settled).toBe(false);
		releaseSlow();

		await expect(pass).rejects.toThrow(/products failed fast/);
		expect(slowCompleted).toBe(true);
	});

	it('reports a cursor write failure without masking completed drills or port failures', async () => {
		const diagnostics = vi.fn();
		const cursorSet = vi.fn(async () => {
			throw new Error('cursor store failed');
		});
		const port = (bucket: number, fetchServerBucket: () => Promise<never[]>) => ({
			bucketSize: 100,
			occupiedBucketIndexes: async () => [bucket],
			readManifestRange: async () => [
				{
					id: String(bucket * 100 + 1),
					wooId: bucket * 100 + 1,
					objectType: 'product' as const,
					digest: '1',
				},
			],
			dirtyWooIds: async () => new Set<number>(),
			fetchServerScanPage: async () => ({
				changes: [
					{
						bucket,
						storedCount: 1,
						currentCount: 0,
						storedDigest: '1',
						currentDigest: '0',
						match: false,
					},
				],
				nextAfterId: (bucket + 1) * 100,
				complete: true,
			}),
			fetchServerBucket,
			deleteProducts: vi.fn(async () => undefined),
			deleteVariations: vi.fn(async () => undefined),
		});
		const coverage = createLocalCoverage({
			database: coverageDatabase() as never,
			freshForMs: 1,
			diagnostics,
			reconcileCursorStore: { get: async () => null, set: cursorSet },
			reconcile: [
				port(0, async () => []),
				port(1, async () => {
					throw new Error('orders drill failed');
				}),
			],
		});

		await expect(coverage.reconcilePass()).rejects.toThrow(/orders drill failed/);
		expect(cursorSet).toHaveBeenCalledOnce();
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'coverage.existence-reconcile',
				level: 'warn',
				message: expect.stringContaining('cursor store failed'),
				fields: expect.objectContaining({ pruned: 1 }),
			})
		);
	});

	it('keeps private LocalCoverage axes behind the facade outside tests', () => {
		const modules = (
			import.meta as ImportMeta & {
				glob: (pattern: string, options: Record<string, unknown>) => Record<string, string>;
			}
		).glob('./*.ts', { eager: true, query: '?raw', import: 'default' });
		const offenders = Object.entries(modules)
			.filter(([file]) => !file.endsWith('.test.ts'))
			.filter(([, source]) =>
				/from ['"]\.\/(?:compaction|manifest|persistence|reconciliation)['"]/.test(source)
			)
			.map(([file]) => file.slice(2));
		expect(offenders).toEqual(['local-coverage.ts']);
	});

	it('keeps issue #496 hooks on the interface without wiring either as a lane', () => {
		const coverage = createLocalCoverage({
			database: { coverageRecords: {}, coverageLanes: {} } as never,
			now: () => 0,
			freshForMs: 1,
		});

		expect(coverage.primeManifest).toEqual(expect.any(Function));
		expect(coverage.reconcilePass).toEqual(expect.any(Function));
	});

	/**
	 * BROWSE-WINDOW LANE EVICTION (#948/#957 follow-up). The facade's one targeted removal.
	 * It is a COMPARE-AND-DELETE: containment is evaluated against the lane as stored at the
	 * moment of deletion, so a walk that rewrites the lane between the plan and the delete
	 * cannot have its coverage thrown away.
	 */
	describe('lane eviction', () => {
		const seed = async (coverage: LocalCoverage, queryKey: string, ids: string[]) =>
			coverage.recordQueryResult({
				collection: 'products',
				queryKey,
				records: ids.map((id) => ({ id })),
				complete: true,
			});

		it('deletes a lane whose ids a larger lane has absorbed', async () => {
			const coverage = createLocalCoverage({
				database: coverageDatabase() as never,
				now: () => 1_000,
				freshForMs: 500,
			});
			await seed(coverage, 'products:browse-window:limit=100', ['a', 'b']);
			await seed(coverage, 'products:browse-window:limit=200', ['a', 'b', 'c']);

			await expect(
				coverage.removeLaneIfContained({
					collection: 'products',
					queryKey: 'products:browse-window:limit=100',
					containedIn: ['a', 'b', 'c'],
					supersededAtMs: 1_000,
				})
			).resolves.toBe(true);
			await expect(
				coverage.readLane('products', 'products:browse-window:limit=100')
			).resolves.toBeNull();
			// The survivor is untouched — it is what the grid footer reads.
			await expect(
				coverage.readLane('products', 'products:browse-window:limit=200')
			).resolves.toMatchObject({ expectedRecordIds: ['a', 'b', 'c'] });
		});

		it('refuses to delete a lane holding an id the superseding lane does not', async () => {
			const coverage = createLocalCoverage({
				database: coverageDatabase() as never,
				now: () => 1_000,
				freshForMs: 500,
			});
			await seed(coverage, 'products:browse-window:limit=100', ['a', 'z']);

			await expect(
				coverage.removeLaneIfContained({
					collection: 'products',
					queryKey: 'products:browse-window:limit=100',
					containedIn: ['a', 'b', 'c'],
					supersededAtMs: 1_000,
				})
			).resolves.toBe(false);
			await expect(
				coverage.readLane('products', 'products:browse-window:limit=100')
			).resolves.not.toBeNull();
		});

		/** A lane a wipe already removed is not an error — absent IS the target state. */
		it('reports no deletion for a lane that is already gone', async () => {
			const coverage = createLocalCoverage({
				database: coverageDatabase() as never,
				now: () => 1_000,
				freshForMs: 500,
			});
			await expect(
				coverage.removeLaneIfContained({
					collection: 'products',
					queryKey: 'products:browse-window:limit=100',
					containedIn: ['a'],
					supersededAtMs: 1_000,
				})
			).resolves.toBe(false);
		});

		it('lists a collection lanes for the eviction sweep', async () => {
			const coverage = createLocalCoverage({
				database: coverageDatabase() as never,
				now: () => 1_000,
				freshForMs: 500,
			});
			await seed(coverage, 'products:browse-window:limit=100', ['a']);
			await seed(coverage, 'products:browse-window:limit=200', ['a', 'b']);

			// `updatedAtMs` rides along because eviction refuses to delete a lane rewritten
			// after the one superseding it.
			await expect(coverage.listLanes('products')).resolves.toEqual([
				{
					queryKey: 'products:browse-window:limit=100',
					complete: true,
					expectedRecordIds: ['a'],
					updatedAtMs: 1_000,
				},
				{
					queryKey: 'products:browse-window:limit=200',
					complete: true,
					expectedRecordIds: ['a', 'b'],
					updatedAtMs: 1_000,
				},
			]);
		});
	});
});
