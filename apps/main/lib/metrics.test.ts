import {
	getMetricsBuckets,
	hydrateMetricsBuckets,
	recordServerLoad,
	recordTransport,
	resetMetricsForTests,
} from './metrics';

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

	it('hydrates persisted buckets without replacing in-memory hours', () => {
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
				requests: 1,
				bytes: 20,
				durationTotalMs: 10,
				durationCount: 1,
				errors: 0,
			},
		]);
	});
});
