type MetricsModule = typeof import('./metrics');

function loadMetrics(): MetricsModule {
	jest.resetModules();
	// jest-expo cannot load workspace TS packages at runtime (see the doMock
	// pattern in create-app-engine.test.ts) — stub the collector seam.
	jest.doMock('@wcpos/sync-core', () => ({
		createMetricsCollector: () => ({
			observe: jest.fn(),
			snapshot: jest.fn(() => ({})),
			reset: jest.fn(),
		}),
	}));
	return jest.requireActual('./metrics');
}

const {
	collectionFromSyncUrl,
	getMetricsEpoch,
	getMetricsBuckets,
	hydrateMetricsBuckets,
	recordServerLoad,
	recordTransport,
	resetMetricsBuckets,
	resetMetricsForTests,
} = loadMetrics();

const HOUR_MS = 60 * 60 * 1000;

describe('host metrics buckets', () => {
	beforeEach(() => {
		resetMetricsForTests();
	});
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('accumulates transport and server-load metrics in hourly buckets', () => {
		jest.spyOn(Date, 'now').mockReturnValue(2 * HOUR_MS + 30_000);

		recordTransport({
			atMs: 2 * HOUR_MS + 1_000,
			durationMs: 25,
			bytes: 120,
			ok: true,
		});
		recordTransport({
			atMs: 2 * HOUR_MS + 2_000,
			durationMs: 75,
			bytes: 30,
			ok: false,
		});
		recordServerLoad(0.5);
		recordServerLoad(0.3);

		expect(getMetricsBuckets()).toEqual([
			{
				hourStartMs: 2 * HOUR_MS,
				requests: 2,
				bytes: 150,
				durationTotalMs: 100,
				durationCount: 2,
				errors: 1,
				loadLast: 0.3,
				loadMax: 0.5,
			},
		]);
	});

	it('keeps only the newest 48 hourly buckets', () => {
		for (let hour = 0; hour < 50; hour += 1) {
			recordTransport({
				atMs: hour * HOUR_MS,
				durationMs: hour,
				bytes: hour,
				ok: true,
			});
		}

		const buckets = getMetricsBuckets();
		expect(buckets).toHaveLength(48);
		expect(buckets[0]?.hourStartMs).toBe(2 * HOUR_MS);
		expect(buckets[47]?.hourStartMs).toBe(49 * HOUR_MS);
	});

	it('ignores malformed byte counts instead of poisoning the bucket total', () => {
		recordTransport({ atMs: 2 * HOUR_MS, durationMs: 10, bytes: 100, ok: true });
		recordTransport({ atMs: 2 * HOUR_MS, durationMs: 10, bytes: Number.NaN, ok: true });
		recordTransport({ atMs: 2 * HOUR_MS, durationMs: 10, bytes: -50, ok: true });
		recordTransport({ atMs: 2 * HOUR_MS, durationMs: 10, bytes: 25, ok: true });

		const [bucket] = getMetricsBuckets();
		expect(bucket?.requests).toBe(4);
		expect(bucket?.bytes).toBe(125);
	});

	it('resetMetricsBuckets drops in-memory buckets so metrics do not cross stores', () => {
		recordTransport({ atMs: 2 * HOUR_MS, durationMs: 10, bytes: 20, ok: true });
		expect(getMetricsBuckets()).toHaveLength(1);

		resetMetricsBuckets();
		expect(getMetricsBuckets()).toEqual([]);

		// A store switch hydrates from the new store without inheriting the old hour.
		hydrateMetricsBuckets([
			{
				hourStartMs: HOUR_MS,
				requests: 5,
				bytes: 60,
				durationTotalMs: 40,
				durationCount: 5,
				errors: 0,
			},
		]);
		expect(getMetricsBuckets().map((bucket) => bucket.hourStartMs)).toEqual([HOUR_MS]);
	});

	it('folds persisted counts into a live hour the engine already opened on startup', () => {
		// A startup tick opens the current hour before the async hydrate resolves.
		recordTransport({ atMs: 2 * HOUR_MS, durationMs: 10, bytes: 20, ok: true });

		hydrateMetricsBuckets([
			{
				hourStartMs: HOUR_MS,
				requests: 3,
				bytes: 40,
				durationTotalMs: 50,
				durationCount: 3,
				errors: 1,
				loadLast: 0.2,
				loadMax: 0.4,
			},
			{
				hourStartMs: 2 * HOUR_MS,
				requests: 99,
				bytes: 99,
				durationTotalMs: 99,
				durationCount: 99,
				errors: 99,
			},
		]);

		expect(getMetricsBuckets()).toEqual([
			{
				// A brand-new hour is taken verbatim from persistence.
				hourStartMs: HOUR_MS,
				requests: 3,
				bytes: 40,
				durationTotalMs: 50,
				durationCount: 3,
				errors: 1,
				loadLast: 0.2,
				loadMax: 0.4,
			},
			{
				// The already-open hour keeps the live tick AND the persisted counts —
				// the persisted totals are not dropped.
				hourStartMs: 2 * HOUR_MS,
				requests: 100,
				bytes: 119,
				durationTotalMs: 109,
				durationCount: 100,
				errors: 99,
			},
		]);
	});

	it('prefers the live server-load reading and takes the max when merging a hour', () => {
		recordServerLoad(0.5); // opens the current hour with a live reading
		const currentHour = getMetricsBuckets()[0]?.hourStartMs ?? 0;

		hydrateMetricsBuckets([
			{
				hourStartMs: currentHour,
				requests: 0,
				bytes: 0,
				durationTotalMs: 0,
				durationCount: 0,
				errors: 0,
				loadLast: 0.1,
				loadMax: 0.9,
			},
		]);

		const [bucket] = getMetricsBuckets();
		expect(bucket?.loadLast).toBe(0.5); // live reading wins
		expect(bucket?.loadMax).toBe(0.9); // max across live + persisted
	});
});

describe('collectionFromSyncUrl', () => {
	it.each([
		['https://s.test/wp-json/wcpos/v2/products?per_page=50', 'products'],
		['https://s.test/wp-json/wcpos/v2/products/categories', 'categories'],
		['https://s.test/wp-json/wcpos/v2/products/brands?page=2', 'brands'],
		['https://s.test/wp-json/wcpos/v2/products/tags', 'tags'],
		['https://s.test/wp-json/wcpos/v2/variations?include=1', 'variations'],
		['https://s.test/wp-json/wcpos/v2/orders/pull?limit=50', 'orders'],
		['https://s.test/wp-json/wcpos/v2/customers', 'customers'],
		['https://s.test/wp-json/wcpos/v2/coupons', 'coupons'],
		['https://s.test/wp-json/wcpos/v2/taxes', 'taxRates'],
		['https://s.test/wp-json/wc/v3/orders?page=1', 'orders'],
	] as const)('maps %s to %s', (url, collection) => {
		expect(collectionFromSyncUrl(url)).toBe(collection);
	});

	it.each([
		['https://s.test/wp-json/wcpos/v2/changes/sequence-log'],
		['https://s.test/wp-json/wcpos/v2/resolve/barcode?code=x'],
		['not a url'],
	])('returns undefined for %s', (url) => {
		expect(collectionFromSyncUrl(url)).toBeUndefined();
	});
});

describe('metrics epoch', () => {
	it('drops a transport completion recorded against a stale epoch (in-flight across store switch)', () => {
		jest.spyOn(Date, 'now').mockReturnValue(HOUR_MS);
		const epochAtStart = getMetricsEpoch();
		resetMetricsBuckets();
		recordTransport({ atMs: HOUR_MS, durationMs: 10, bytes: 100, ok: true, epoch: epochAtStart });
		expect(getMetricsBuckets()).toEqual([]);
	});

	it('records a transport whose epoch is current', () => {
		jest.spyOn(Date, 'now').mockReturnValue(HOUR_MS);
		recordTransport({
			atMs: HOUR_MS,
			durationMs: 10,
			bytes: 100,
			ok: true,
			epoch: getMetricsEpoch(),
		});
		expect(getMetricsBuckets()).toHaveLength(1);
	});
});

describe('server-load epoch', () => {
	it('drops a stale-epoch load sample after a store switch', () => {
		jest.spyOn(Date, 'now').mockReturnValue(HOUR_MS);
		const epochAtStart = getMetricsEpoch();
		resetMetricsBuckets();
		recordServerLoad(0.7, epochAtStart);
		expect(getMetricsBuckets()).toEqual([]);
	});
});
