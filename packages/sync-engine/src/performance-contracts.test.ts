// @vitest-environment node
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
	createRxdbSyncEngine,
	type RxdbSyncEnginePorts,
	type StoreScopeIdentity,
} from './create-rxdb-sync-engine';
import { forEachYielding } from './event-loop-yield';
import { existenceManifestDocument } from './local-coverage/existence-manifest-schema';
import { materializeTargeted } from './materialization/record-materialization';
import { memoryEngineStorage, remoteId } from './testing';

import type { RxDatabase } from 'rxdb';

/**
 * Performance CONTRACTS for the sync engine — tranche 1 of #949.
 *
 * 1.9 shipped three performance-contract suites against the old query package
 * (`packages/query/tests/{performance,performance-ttfr,yield}.test.ts`). The rewrite
 * deleted them with no successor, which is exactly the class of guarantee that goes
 * silently missing in a rewrite: every functional suite stays green while a large
 * store's POS freezes.
 *
 * These are ORDER-OF-MAGNITUDE regression detectors, not micro-benchmarks. A passing
 * run says "the engine did not get ~20x slower", not "the engine is fast". Every
 * budget below is annotated with the value actually measured when it was written, so
 * a future tuner can see the headroom rather than guess at it.
 *
 * Measured 2026-08-06 on `next` @ d62440926, Apple silicon, memory storage, 5 runs
 * after the warmup pass below (spread within +-3%):
 *   - existence-reconcile audit, 10k residents ....... 58-60 ms
 *   - existence-reconcile audit, 50k residents ....... 264-276 ms
 *   - longest uninterrupted block, 10k audit ......... 55-58 ms (yields: 0)
 *   - first page of 5k local residents ............... 9 ms
 *
 * Re-measured 2026-08-06 after tranche 2 restored chunked yielding (ruling R10b). Both columns
 * below were taken on the SAME machine in the same session, 3 runs each, by stashing the change
 * and re-running — so they are comparable, unlike the pre-reboot numbers above:
 *
 *                                            before (next)      after (R10b)
 *   - reconcile audit, 10k residents ....... 57.5-60.8 ms       67.5-68.6 ms   (+14%)
 *   - reconcile audit, 50k residents ....... 254.6-255.7 ms     288.5-291.5 ms (+13%)
 *   - longest uninterrupted block, 10k ..... 53.5-55.0 ms       29.4-30.4 ms   (-45%)
 *   - macrotask yields during that audit ... 0                  17-18
 *
 * The throughput cost is the price of the block-length win: paging the manifest scan runs ~30%
 * slower than one unbounded query, and each yield is a real macrotask hop. Percent-level, not a
 * multiple, and the budgets keep 10-15x headroom.
 *
 * Ported contracts measured 2026-08-06 on this branch, same host and storage, 3 runs:
 *   - 10k product bulk apply ........................ 8.9-9.7 ms
 *   - reset 5k products + product manifest cleanup . 125.3-173.4 ms
 *   - forEachYielding over 50k items ................ 1.0-1.1 ms
 *   - mixed 5k-local / 10k-server reconcile ........ 561.5-597.6 ms
 *   - TTFR during 10k audits ........................ 7.1-10.3 ms
 *   - TTFR during 50k audits ........................ 40.5-53.8 ms
 */

setPremiumFlag();

// ---------------------------------------------------------------------------
// Tunable contract constants — the only numbers a future tuner should touch.
// ---------------------------------------------------------------------------

/**
 * Shared CI runners are noisier and slower than a dev machine, so every wall-clock
 * budget is multiplied there. Set PERF_BUDGET_MULTIPLIER to reproduce a CI failure
 * locally, e.g.
 *   PERF_BUDGET_MULTIPLIER=3 pnpm --filter @wcpos/sync-engine exec vitest run performance-contracts
 */
function parseBudgetMultiplier(value: string): number {
	const multiplier = Number(value);
	if (!Number.isFinite(multiplier) || multiplier <= 0) {
		throw new Error('PERF_BUDGET_MULTIPLIER must be a finite number greater than 0');
	}
	return multiplier;
}

/**
 * Longest uninterrupted block the audit may hold the macrotask queue for.
 *
 * 1.9's contract was a p95 event-loop delay under 100 ms during a large audit, which only
 * means something if the audit yields REPEATEDLY — 1.9's `processFullAudit` chunked its work
 * through an explicit `yieldToEventLoop()`.
 *
 * Tranche 1 (#1006) measured the rewritten engine performing ZERO macrotask yields: every run
 * recorded exactly ONE sample, so p95 collapsed onto max and this constant had to be parked at
 * 1,000 ms — a bound the engine passed only because 10k is small. Tranche 2 (ruling R10b)
 * restored the chunk-and-yield discipline, so the audit is now many short spans and 1.9's
 * sub-100 ms intent is back in force.
 *
 * Measured 2026-08-06 on this branch, Apple silicon, memory storage, 3 runs after the warmup
 * pass: max block 29.4-30.4 ms across 18-19 spans. The budget keeps ~3.3x headroom on top of
 * that (plus the x3 CI multiplier) while still catching a regression back to an unbroken walk —
 * the unchunked engine blocked for 53.5-55.0 ms here, and ~255 ms at 50k.
 *
 * The floor is no longer the walk itself but the single `products.find().exec()` the dirty-guard
 * scan issues: one storage query that cannot be split without a 2-4x throughput regression
 * (measured — keyset paging products is not index-backed on this schema). In the browser and on
 * native that query runs worker-side, so the figure above is pessimistic for production.
 */
const MAX_EVENT_LOOP_BLOCK_MS = 100;

/**
 * The audit must hand the event loop at least one real turn. This is the assertion tranche 1
 * could only REPORT: a count of 0 means some future refactor collapsed the walk back into a
 * single unbroken block, which is invisible to every functional test and to the wall-clock
 * budgets above. Deliberately `> 0` rather than a tight count — the exact number is a function
 * of the tunable chunk sizes, and pinning it here would make every retune a test edit.
 */
const MIN_AUDIT_YIELDS = 0;

/**
 * Audit wall-clock budgets. 1.9's equivalents were 10s at 10k and 30s at 50k against
 * the old engine; the new engine is far faster, so a 10s budget would have ~170x
 * headroom and catch nothing. These sit ~15x above the measured steady state, which
 * still absorbs a 4x-slower CI runner (plus the x3 CI multiplier) while catching an
 * order-of-magnitude regression.
 */
const RECONCILE_BUDGET_MS: Readonly<Record<number, number>> = {
	10_000: 1_000,
	50_000: 3_000,
};

/** 11-18x the measured maxima above; CI applies the same additional x3 multiplier. */
const BULK_APPLY_BUDGET_MS = 150;
const COLLECTION_RESET_BUDGET_MS = 2_000;
const YIELDING_WALK_BUDGET_MS = 20;
const MIXED_RECONCILE_BUDGET_MS = 10_000;

/**
 * Residents seeded into a throwaway engine before the measured runs. Without it the
 * first measured audit pays V8/RxDB/materialization cold-start and reads 4x slower
 * than steady state, which is exactly the kind of variance that makes a perf gate
 * flaky enough to be disabled.
 */
const WARMUP_RESIDENTS = 500;

/**
 * Time-to-first-result budgets by resident count, carried over from 1.9's
 * performance-ttfr.test.ts tiers (0 / 100 / 1k / 5k residents, 500 ms - 5 s).
 */
const TTFR_TIERS: readonly { residents: number; budgetMs: number }[] = [
	{ residents: 0, budgetMs: 500 },
	{ residents: 100, budgetMs: 1_000 },
	{ residents: 1_000, budgetMs: 2_000 },
	{ residents: 5_000, budgetMs: 5_000 },
];

/** Documents the concurrent bulk apply writes while the TTFR query is in flight. */
const CONCURRENT_APPLY_SIZE = 500;

const AUDIT_TTFR_OVERLAYS: readonly {
	residents: 0 | 1_000 | 5_000;
	auditSize: number;
}[] = [
	{ residents: 0, auditSize: 10_000 },
	{ residents: 0, auditSize: 50_000 },
	{ residents: 1_000, auditSize: 10_000 },
	{ residents: 5_000, auditSize: 50_000 },
];

/** Generous ceiling so a genuinely slow run reports a BUDGET failure, not a timeout. */
const TEST_TIMEOUT_MS = 300_000;

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const SITE = 'https://perf.example.test';
const BASE = `${SITE}/wp-json/wcpos/v2`;

let scope = 0;
type DisposableEngine = { dispose(): Promise<unknown> };
const activeEngines = new Set<DisposableEngine>();

function trackEngine<T extends DisposableEngine>(engine: T): T {
	activeEngines.add(engine);
	return engine;
}

async function disposeEngine(engine: DisposableEngine): Promise<void> {
	try {
		await engine.dispose();
	} finally {
		activeEngines.delete(engine);
	}
}

async function disposeEngines(): Promise<void> {
	await Promise.all([...activeEngines].map(disposeEngine));
}

const identity = (): StoreScopeIdentity => ({
	site: SITE,
	storeId: 1,
	cashierId: `perf-${++scope}`,
});

const json = (body: unknown): Response =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});

function engineWith(fetcher: NonNullable<RxdbSyncEnginePorts['fetcher']>) {
	return trackEngine(
		createRxdbSyncEngine(
			{
				site: { syncBaseUrl: BASE, wpJsonRoot: `${SITE}/wp-json` },
				// validate: false — z-schema validation of 50k documents would dominate every
				// measurement here, and this suite is about ENGINE work, not schema validation.
				storage: memoryEngineStorage({ validate: false }),
				mode: 'manual',
				fetcher: async (url, init) =>
					url.endsWith('/changes/config-fingerprint')
						? json({ fingerprints: {} })
						: fetcher(url, init),
			},
			identity()
		)
	);
}

const digestFor = (wooId: number): string => String(1_000_000 + wooId);

/** Deterministic v4-shaped uuid; `laneOffset` keeps the lanes' id spaces disjoint. */
const uuidFor = (wooId: number, laneOffset: number): string =>
	`00000000-0000-4000-8000-${String(laneOffset + wooId).padStart(12, '0')}`;

function productPayload(wooId: number): Record<string, unknown> {
	return {
		id: wooId,
		name: `Perf product ${wooId}`,
		status: 'publish',
		type: 'simple',
		price: '9.99',
		stock_status: 'instock',
		stock_quantity: null,
		on_sale: false,
		featured: false,
		categories: [],
		brands: [],
		date_modified_gmt: '2026-01-01T00:00:00',
		_rxdb_digest: digestFor(wooId),
		meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(wooId, 0) }],
	};
}

function productDocuments(startWooId: number, count: number): Record<string, unknown>[] {
	return Array.from(
		{ length: count },
		(_unused, index) =>
			materializeTargeted('products', productPayload(startWooId + index)).storedDocument
	);
}

function productManifestRows(
	startWooId: number,
	count: number
): ReturnType<typeof existenceManifestDocument>[] {
	return Array.from({ length: count }, (_unused, index) => {
		const wooId = startWooId + index;
		return existenceManifestDocument({
			wooId,
			objectType: 'product',
			digest: digestFor(wooId),
		});
	});
}

async function seedProductManifestRange(
	database: RxDatabase,
	startWooId: number,
	count: number
): Promise<void> {
	if (count === 0) return;
	await database.collections['existenceManifest']!.bulkUpsert(
		productManifestRows(startWooId, count) as never[]
	);
}

/** Seed N resident products plus their existence-manifest rows, in one bulk write each. */
async function seedResidentProductRange(
	database: RxDatabase,
	startWooId: number,
	count: number
): Promise<void> {
	if (count === 0) return;
	await database.collections['products']!.bulkUpsert(
		productDocuments(startWooId, count) as never[]
	);
	await seedProductManifestRange(database, startWooId, count);
}

async function seedResidentProducts(database: RxDatabase, count: number): Promise<void> {
	await seedResidentProductRange(database, 1, count);
}

function scanAggregateEnvelope(url: string, serverCount: number) {
	const parsed = new URL(url);
	const bucketSize = Number(parsed.searchParams.get('bucket_size'));
	const afterId = Number(parsed.searchParams.get('after_id'));
	const limitBuckets = Number(parsed.searchParams.get('limit_buckets'));
	const firstBucket = Math.floor(afterId / bucketSize);
	const maxBucket = Math.floor(serverCount / bucketSize);
	const lastBucket = Math.min(firstBucket + limitBuckets - 1, maxBucket);
	const changes = [];
	for (let bucket = firstBucket; bucket <= lastBucket; bucket += 1) {
		const lo = Math.max(bucket * bucketSize, 1);
		const hi = Math.min((bucket + 1) * bucketSize, serverCount + 1);
		if (lo >= hi) continue;
		let digest = 0n;
		for (let wooId = lo; wooId < hi; wooId += 1) digest ^= BigInt(digestFor(wooId));
		changes.push({
			bucket,
			stored_count: hi - lo,
			current_count: hi - lo,
			stored_digest: digest.toString(),
			current_digest: digest.toString(),
			match: true,
		});
	}
	return {
		collection: 'products',
		checkpoint: {
			bucket_size: bucketSize,
			after_id: (lastBucket + 1) * bucketSize,
		},
		changes,
		complete: lastBucket >= maxBucket,
		meta: {},
	};
}

/** Matching scan aggregates make the drift-free audit skip every expensive bucket request. */
function convergedBucketFetcher(residentCount: number) {
	return vi.fn(async (url: string) => {
		const parsed = new URL(url);
		if (parsed.pathname.endsWith('/integrity/scan')) {
			return json(scanAggregateEnvelope(url, residentCount));
		}
		if (!parsed.pathname.endsWith('/integrity/bucket')) return json({ ids: [] });
		// Only the products manifest is seeded; the customers/orders ports report empty.
		if (parsed.searchParams.get('collection') !== null) return json({ ids: [] });
		const bucket = Number(parsed.searchParams.get('bucket'));
		const bucketSize = Number(parsed.searchParams.get('bucket_size'));
		const lo = bucket * bucketSize;
		const hi = Math.min(lo + bucketSize, residentCount + 1);
		const ids: { id: number; digest: string; object_type: string }[] = [];
		for (let wooId = Math.max(lo, 1); wooId < hi; wooId += 1) {
			ids.push({ id: wooId, digest: digestFor(wooId), object_type: 'product' });
		}
		return json({ ids });
	});
}

/** 5k local rows: 2.5k overlap plus 2.5k stale; server: 10k rows with 7.5k additions. */
function mixedShapeFetcher(serverCount: number) {
	return vi.fn(async (url: string) => {
		const parsed = new URL(url);
		if (parsed.pathname.endsWith('/integrity/scan')) {
			return json(scanAggregateEnvelope(url, serverCount));
		}
		if (parsed.pathname.endsWith('/integrity/bucket')) {
			if (parsed.searchParams.get('collection') !== null) return json({ ids: [] });
			const bucket = Number(parsed.searchParams.get('bucket'));
			const bucketSize = Number(parsed.searchParams.get('bucket_size'));
			const lo = bucket * bucketSize;
			const hi = Math.min(lo + bucketSize, serverCount + 1);
			return json({
				ids: Array.from({ length: Math.max(0, hi - Math.max(lo, 1)) }, (_unused, index) => {
					const wooId = Math.max(lo, 1) + index;
					return {
						id: wooId,
						digest: digestFor(wooId),
						object_type: 'product',
					};
				}),
			});
		}
		if (parsed.pathname.endsWith('/products')) {
			const ids = (parsed.searchParams.get('include') ?? '').split(',').filter(Boolean).map(Number);
			return json(ids.map(productPayload));
		}
		return json({ ids: [] });
	});
}

async function measureFirstPage(
	database: RxDatabase,
	residentCeiling: number
): Promise<{ elapsedMs: number; hitCount: number }> {
	const started = performance.now();
	const page = await database.collections['products']!.find({
		selector: { remoteId: { $lte: remoteId(residentCeiling) } },
		limit: 10,
	}).exec();
	return { elapsedMs: performance.now() - started, hitCount: page.length };
}

/**
 * Node-native event-loop delay sampler, carried over from 1.9's performance-ttfr.test.ts.
 * Each iteration awaits a 0 ms timer and records the wall-clock overshoot: while the
 * engine monopolises the loop the timer cannot fire, so the overshoot IS the freeze a
 * cashier feels. (1.9's browser sampler in sync-core used requestAnimationFrame +
 * longtask PerformanceObserver, neither of which exists under vitest's node env.)
 */
function startEventLoopSampler(): { stop: () => Promise<number[]> } {
	const delays: number[] = [];
	let sampling = true;
	const loop = (async () => {
		while (sampling) {
			const started = performance.now();
			await new Promise((resolve) => setTimeout(resolve, 0));
			delays.push(performance.now() - started);
		}
	})();
	return {
		stop: async () => {
			sampling = false;
			await loop;
			return delays;
		},
	};
}

/** Nearest-rank percentile, matching 1.9's `sorted[Math.floor(len * p)]`. */
function percentile(values: readonly number[], fraction: number): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

/**
 * Warm V8, RxDB and the materialization path on a throwaway engine so the first
 * MEASURED audit reports steady-state cost rather than cold-start cost.
 */
beforeAll(async () => {
	const engine = engineWith(convergedBucketFetcher(WARMUP_RESIDENTS));
	try {
		const active = await engine.ready;
		await seedResidentProducts(active.database, WARMUP_RESIDENTS);
		await engine.sync('existence-reconcile');
		await active.database.collections['products']!.find({ limit: 10 }).exec();
	} finally {
		await disposeEngine(engine);
	}
}, TEST_TIMEOUT_MS);

afterEach(async () => {
	await disposeEngines();
	vi.restoreAllMocks();
});

afterAll(disposeEngines);

describe('performance harness safeguards', () => {
	it('rejects invalid performance budget multipliers', () => {
		for (const value of ['', 'not-a-number', '0', '-1', 'Infinity']) {
			expect(() => parseBudgetMultiplier(value)).toThrow(
				'PERF_BUDGET_MULTIPLIER must be a finite number greater than 0'
			);
		}
	});

	it('disposes tracked engines after a contract fails', async () => {
		const dispose = vi.fn(async () => undefined);
		trackEngine({ dispose });

		await disposeEngines();

		expect(dispose).toHaveBeenCalledOnce();
	});
});

describe('sync-engine performance contracts (#949)', () => {
	const budgetMultiplier = parseBudgetMultiplier(
		process.env['PERF_BUDGET_MULTIPLIER'] ?? (process.env['CI'] ? '3' : '1')
	);
	const budget = (ms: number): number => ms * budgetMultiplier;
	const report = (label: string, measuredMs: number, budgetMs: number, extra = ''): void => {
		process.stderr.write(
			`[perf] ${label}: ${measuredMs.toFixed(1)}ms (budget ${budgetMs.toFixed(0)}ms, x${budgetMultiplier})${extra}\n`
		);
	};

	// -------------------------------------------------------------------------
	// Contract 1 — large-dataset audit throughput
	// -------------------------------------------------------------------------

	for (const residents of [10_000, 50_000] as const) {
		it(
			`completes an existence-reconcile audit over ${residents.toLocaleString('en-US')} residents within budget`,
			async () => {
				const fetcher = convergedBucketFetcher(residents);
				const engine = engineWith(fetcher);
				const active = await engine.ready;
				await seedResidentProducts(active.database, residents);

				const started = performance.now();
				const result = await engine.sync('existence-reconcile');
				const elapsed = performance.now() - started;

				const budgetMs = budget(RECONCILE_BUDGET_MS[residents]!);
				report(
					`reconcile ${residents}`,
					elapsed,
					budgetMs,
					` buckets=${fetcher.mock.calls.length}`
				);

				expect(result.status).toBe('ran');
				const paths = fetcher.mock.calls.map(([url]) => new URL(url).pathname);
				expect(paths.filter((path) => path.endsWith('/integrity/bucket'))).toHaveLength(0);
				const scanRequests = paths.filter((path) => path.endsWith('/integrity/scan')).length;
				expect(scanRequests).toBeGreaterThan(0);
				expect(scanRequests).toBeLessThanOrEqual(3);
				expect(elapsed).toBeLessThan(budgetMs);
			},
			TEST_TIMEOUT_MS
		);
	}

	// -------------------------------------------------------------------------
	// Contract 2 — event-loop fairness under a heavy audit
	// -------------------------------------------------------------------------

	it(
		'never blocks the event loop for a full frame-budget-shattering span while auditing 10,000 residents',
		async () => {
			const residents = 10_000;
			const engine = engineWith(convergedBucketFetcher(residents));
			const active = await engine.ready;
			await seedResidentProducts(active.database, residents);

			const sampler = startEventLoopSampler();
			await engine.sync('existence-reconcile');
			const delays = await sampler.stop();

			expect(delays.length).toBeGreaterThan(0);
			const maxBlock = Math.max(...delays);
			const yields = delays.length - 1;
			const budgetMs = budget(MAX_EVENT_LOOP_BLOCK_MS);
			report(
				'event-loop max block',
				maxBlock,
				budgetMs,
				` spans=${delays.length} yields=${yields} p95=${percentile(delays, 0.95).toFixed(1)}ms`
			);

			// The audit walks the catalog in chunks and yields between them (#949 tranche 2).
			// Without this the two assertions below can both pass on a single unbroken span
			// that simply happens to be short at 10k — which is exactly the state tranche 1
			// found, and which grows without bound with the store.
			expect(yields).toBeGreaterThan(MIN_AUDIT_YIELDS);

			// A block past ~100ms is the perceived-lag threshold (16ms is the 60fps frame
			// budget); a multi-second one is the "POS froze during sync" bug report.
			expect(maxBlock).toBeLessThan(budgetMs);
			// p95 is the shape 1.9 actually contracted on, and it only means something once
			// there are many spans to rank — which the yield assertion above guarantees.
			expect(percentile(delays, 0.95)).toBeLessThan(budgetMs);
		},
		TEST_TIMEOUT_MS
	);

	// -------------------------------------------------------------------------
	// Contract 3 — time to first result for a local-resident query
	// -------------------------------------------------------------------------

	for (const { residents, budgetMs } of TTFR_TIERS) {
		it(
			`returns a first page over ${residents.toLocaleString('en-US')} local residents within budget while a bulk apply runs`,
			async () => {
				const engine = engineWith(convergedBucketFetcher(residents));
				const active = await engine.ready;
				await seedResidentProducts(active.database, residents);

				// A concurrent bulk apply, deliberately NOT awaited: the contract is that a
				// cashier's query still lands while the products collection is writing. The
				// inserted IDs sit above the resident range queried below.
				const concurrentApply = active.database.collections['products']!.bulkUpsert(
					productDocuments(residents + 1, CONCURRENT_APPLY_SIZE) as never[]
				);
				let applySettled = false;
				void concurrentApply.finally(() => {
					applySettled = true;
				});

				// The apply must still be in flight when the timer starts, or this measures a
				// query against an idle collection and the contention contract is vacuous.
				// Flush one microtask first: `.finally` runs in a microtask, so without the
				// flush an ALREADY-fulfilled apply would still read as pending here.
				await Promise.resolve();
				expect(applySettled).toBe(false);
				const { elapsedMs, hitCount } = await measureFirstPage(active.database, residents);

				const scaledBudget = budget(budgetMs);
				report(`ttfr ${residents}`, elapsedMs, scaledBudget, ` hits=${hitCount}`);

				expect(hitCount).toBe(Math.min(10, residents));
				expect(elapsedMs).toBeLessThan(scaledBudget);

				await concurrentApply;
				expect(await active.database.collections['products']!.count().exec()).toBe(
					residents + CONCURRENT_APPLY_SIZE
				);
			},
			TEST_TIMEOUT_MS
		);
	}

	// -------------------------------------------------------------------------
	// Contract 4 — write/reset throughput and direct yielding utility
	// -------------------------------------------------------------------------

	it(
		'applies 10,000 product records within budget',
		async () => {
			const recordCount = 10_000;
			const engine = engineWith(convergedBucketFetcher(0));
			const active = await engine.ready;
			const documents = productDocuments(1, recordCount);

			const started = performance.now();
			await active.database.collections['products']!.bulkUpsert(documents as never[]);
			const elapsed = performance.now() - started;

			const budgetMs = budget(BULK_APPLY_BUDGET_MS);
			report('bulk apply 10000', elapsed, budgetMs);
			expect(await active.database.collections['products']!.count().exec()).toBe(recordCount);
			expect(elapsed).toBeLessThan(budgetMs);
		},
		TEST_TIMEOUT_MS
	);

	it(
		'resets a 5,000-record products collection within budget',
		async () => {
			const recordCount = 5_000;
			const engine = engineWith(convergedBucketFetcher(recordCount));
			const active = await engine.ready;
			await seedResidentProducts(active.database, recordCount);

			const started = performance.now();
			const result = await engine.scope.resetCollection('products');
			const elapsed = performance.now() - started;

			const budgetMs = budget(COLLECTION_RESET_BUDGET_MS);
			report('reset products 5000', elapsed, budgetMs);
			expect(result).toBe('reset');
			expect(await active.database.collections['products']!.count().exec()).toBe(0);
			expect(await active.database.collections['existenceManifest']!.count().exec()).toBe(0);
			expect(elapsed).toBeLessThan(budgetMs);
		},
		TEST_TIMEOUT_MS
	);

	it(
		'processes 50,000 items with forEachYielding within budget without starving the event loop',
		async () => {
			const itemCount = 50_000;
			const items = Array.from({ length: itemCount }, (_unused, index) => index);
			let processed = 0;
			let processingComplete = false;
			let yieldedBeforeCompletion = false;
			setImmediate(() => {
				yieldedBeforeCompletion = !processingComplete;
			});

			const started = performance.now();
			await forEachYielding(items, 5_000, () => {
				processed += 1;
			});
			const elapsed = performance.now() - started;
			processingComplete = true;

			const budgetMs = budget(YIELDING_WALK_BUDGET_MS);
			report('forEachYielding 50000', elapsed, budgetMs, ` yielded=${yieldedBeforeCompletion}`);
			expect(processed).toBe(itemCount);
			expect(yieldedBeforeCompletion).toBe(true);
			expect(elapsed).toBeLessThan(budgetMs);
		},
		TEST_TIMEOUT_MS
	);

	// -------------------------------------------------------------------------
	// Contract 5 — divergent audit throughput
	// -------------------------------------------------------------------------

	it(
		'audits and prunes 5,000 local residents against a mixed 10,000-record server manifest within budget',
		async () => {
			const serverCount = 10_000;
			const overlapCount = 2_500;
			const deletedStart = 10_001;
			const deletedCount = 2_500;
			const fetcher = mixedShapeFetcher(serverCount);
			const engine = engineWith(fetcher);
			const active = await engine.ready;
			await seedResidentProductRange(active.database, 1, overlapCount);
			await seedResidentProductRange(active.database, deletedStart, deletedCount);

			const requestStart = fetcher.mock.calls.length;
			const started = performance.now();
			const results = [];
			for (let tick = 0; tick < 4; tick += 1) {
				const tickStart = fetcher.mock.calls.length;
				results.push(await engine.sync('existence-reconcile'));
				const tickPaths = fetcher.mock.calls.slice(tickStart).map(([url]) => new URL(url).pathname);
				expect(
					tickPaths.filter((path) => path.endsWith('/integrity/bucket')).length
				).toBeLessThanOrEqual(2);
				expect(
					tickPaths.filter((path) => path.endsWith('/integrity/scan')).length
				).toBeLessThanOrEqual(3);
				if ((await active.database.collections['products']!.count().exec()) === overlapCount) break;
			}
			const elapsed = performance.now() - started;

			const budgetMs = budget(MIXED_RECONCILE_BUDGET_MS);
			report(
				'mixed reconcile local=5000 server=10000',
				elapsed,
				budgetMs,
				' overlap=2500 missing=7500 pruned=2500'
			);
			const auditRequests = fetcher.mock.calls.slice(requestStart).map(([url]) => new URL(url));
			expect(results.length).toBeGreaterThan(1);
			expect(results.every((result) => result.status === 'ran')).toBe(true);
			expect(
				auditRequests.some(
					({ pathname, searchParams }) =>
						pathname.endsWith('/products') || searchParams.has('include')
				)
			).toBe(false);
			expect(await active.database.collections['products']!.count().exec()).toBe(overlapCount);
			expect(
				await active.database.collections['products']!.findOne(uuidFor(5_000, 0)).exec()
			).toBeNull();
			expect(
				await active.database.collections['products']!.findOne(uuidFor(deletedStart, 0)).exec()
			).toBeNull();
			expect(elapsed).toBeLessThan(budgetMs);
		},
		TEST_TIMEOUT_MS
	);

	// -------------------------------------------------------------------------
	// Contract 6 — TTFR under audit and larger/repeated apply contention
	// -------------------------------------------------------------------------

	for (const { residents, auditSize } of AUDIT_TTFR_OVERLAYS) {
		it(
			`returns the ${residents.toLocaleString('en-US')}-resident first page within its tier budget while a ${auditSize.toLocaleString('en-US')}-record audit runs`,
			async () => {
				const bucketFetcher = convergedBucketFetcher(auditSize);
				// `engine.sync()` first parks on readySettledForSync, so an unguarded
				// measureFirstPage can finish before the audit does any work. Gate the
				// TTFR timer on the audit's first bucket fetch so the contracts measure
				// genuine contention, not a query racing an idle lane.
				let signalAuditEntered!: () => void;
				const auditEntered = new Promise<void>((resolve) => {
					signalAuditEntered = resolve;
				});
				const fetcher = vi.fn(async (url: string) => {
					signalAuditEntered();
					return bucketFetcher(url);
				});
				const engine = engineWith(fetcher);
				const active = await engine.ready;
				await seedResidentProducts(active.database, residents);
				await seedProductManifestRange(active.database, residents + 1, auditSize - residents);

				const concurrentAudit = engine.sync('existence-reconcile');
				await auditEntered;
				const { elapsedMs, hitCount } = await measureFirstPage(active.database, residents);
				const result = await concurrentAudit;

				const tier = TTFR_TIERS.find((candidate) => candidate.residents === residents)!;
				const budgetMs = budget(tier.budgetMs);
				report(
					`ttfr ${residents} during audit ${auditSize}`,
					elapsedMs,
					budgetMs,
					` hits=${hitCount}`
				);
				expect(hitCount).toBe(Math.min(10, residents));
				expect(elapsedMs).toBeLessThan(budgetMs);
				expect(result.status).toBe('ran');
				const paths = fetcher.mock.calls.map(([url]) => new URL(url).pathname);
				expect(paths.filter((path) => path.endsWith('/integrity/bucket'))).toHaveLength(0);
				expect(paths.filter((path) => path.endsWith('/integrity/scan')).length).toBeLessThanOrEqual(
					3
				);
			},
			TEST_TIMEOUT_MS
		);
	}

	it(
		'returns the empty-resident first page within its tier budget while 1,000 records apply',
		async () => {
			const recordCount = 1_000;
			const engine = engineWith(convergedBucketFetcher(0));
			const active = await engine.ready;
			const concurrentApply = active.database.collections['products']!.bulkUpsert(
				productDocuments(1, recordCount) as never[]
			);

			const { elapsedMs, hitCount } = await measureFirstPage(active.database, 0);
			const budgetMs = budget(TTFR_TIERS[0]!.budgetMs);
			report('ttfr 0 during bulk apply 1000', elapsedMs, budgetMs, ` hits=${hitCount}`);
			expect(hitCount).toBe(0);
			expect(elapsedMs).toBeLessThan(budgetMs);

			await concurrentApply;
			expect(await active.database.collections['products']!.count().exec()).toBe(recordCount);
		},
		TEST_TIMEOUT_MS
	);

	it(
		'returns the empty-resident first page within its tier budget while five bulk applies run sequentially',
		async () => {
			const batchCount = 5;
			const batchSize = 200;
			const engine = engineWith(convergedBucketFetcher(0));
			const active = await engine.ready;
			let appliesSettled = false;
			const sequentialApplies = (async () => {
				for (let batch = 0; batch < batchCount; batch += 1) {
					await active.database.collections['products']!.bulkUpsert(
						productDocuments(batch * batchSize + 1, batchSize) as never[]
					);
				}
			})();
			void sequentialApplies.finally(() => {
				appliesSettled = true;
			});
			// Same in-flight proof as the single-apply tiers (microtask flushed first).
			await Promise.resolve();
			expect(appliesSettled).toBe(false);

			const { elapsedMs, hitCount } = await measureFirstPage(active.database, 0);
			const budgetMs = budget(TTFR_TIERS[0]!.budgetMs);
			report('ttfr 0 during 5x200 bulk applies', elapsedMs, budgetMs, ` hits=${hitCount}`);
			expect(hitCount).toBe(0);
			expect(elapsedMs).toBeLessThan(budgetMs);

			await sequentialApplies;
			expect(await active.database.collections['products']!.count().exec()).toBe(
				batchCount * batchSize
			);
		},
		TEST_TIMEOUT_MS
	);
});
