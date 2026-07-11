// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
	createQueryTotalRequestRunner,
	mergeQueryTotalCacheEntries,
	type QueryTotalDiagnostic,
} from './query-total-request-runner';

import type { QueryTotalCacheEntry } from './query-total-requests';

/**
 * Interface tests for the extracted lifecycle — no app mount, no RxDB. With
 * `database: null` the runner exercises the planner + fetch + publish machine
 * against the host-supplied seams alone (the durable claim/retry discipline is
 * covered end-to-end by App.test.tsx and the mount kit's retry-scan tests).
 */

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function harness(over: Partial<Parameters<typeof createQueryTotalRequestRunner>[0]> = {}) {
	const diagnostics: QueryTotalDiagnostic[] = [];
	let entries: QueryTotalCacheEntry[] = [];
	const fetchWooQueryTotal = vi.fn(async () => 42);
	const runner = createQueryTotalRequestRunner({
		database: null,
		ownerId: 'test-owner',
		endpoint: 'https://demo.local/wp-json/wc-rxdb-sync/v1/orders',
		fetchWooQueryTotal,
		onDiagnostic: (event) => diagnostics.push(event),
		readCacheEntries: () => entries,
		publishCacheEntries: (updater) => {
			entries = updater(entries);
		},
		now: () => 1_000_000,
		isOffline: () => false,
		...over,
	});
	return { runner, diagnostics, fetchWooQueryTotal, cacheEntries: () => entries };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createQueryTotalRequestRunner', () => {
	it('fetches, publishes the cache entry, and reports it', async () => {
		const { runner, diagnostics, fetchWooQueryTotal, cacheEntries } = harness();

		runner.request({
			queryKey: 'orders:browser:status=processing:limit=50',
			filters: { status: 'processing' },
		});
		await flush();

		expect(fetchWooQueryTotal).toHaveBeenCalledTimes(1);
		expect(fetchWooQueryTotal).toHaveBeenCalledWith(
			expect.objectContaining({
				request: expect.objectContaining({
					endpoint: 'https://demo.local/wp-json/wc-rxdb-sync/v1/orders',
				}),
			})
		);
		expect(cacheEntries()).toEqual([
			expect.objectContaining({
				queryKey: 'orders:browser:status=processing:limit=50',
				totalMatchingRecords: 42,
			}),
		]);
		expect(
			diagnostics.some(
				(d) => d.message.includes('Cached Woo query total') && d.message.includes('42')
			)
		).toBe(true);
	});

	it('uses a fresh cached total without fetching', async () => {
		const { runner, diagnostics, fetchWooQueryTotal } = harness({
			readCacheEntries: () => [
				{
					queryKey: 'orders:q',
					totalMatchingRecords: 7,
					freshUntilMs: 2_000_000,
					updatedAtMs: 900_000,
				},
			],
		});

		runner.request({ queryKey: 'orders:q', filters: {} });
		await flush();

		expect(fetchWooQueryTotal).not.toHaveBeenCalled();
		expect(
			diagnostics.some((d) => d.message.includes('Using cached Woo query total for orders:q: 7'))
		).toBe(true);
	});

	it('dedupes a request while the same queryKey is in flight', async () => {
		const gate = deferred<number>();
		const fetchWooQueryTotal = vi.fn(() => gate.promise);
		const { runner, diagnostics } = harness({ fetchWooQueryTotal });

		runner.request({ queryKey: 'orders:q', filters: {} });
		await flush();
		runner.request({ queryKey: 'orders:q', filters: {} });

		expect(fetchWooQueryTotal).toHaveBeenCalledTimes(1);
		expect(
			diagnostics.some((d) => d.message.includes('Waiting for in-flight Woo query total'))
		).toBe(true);
		gate.resolve(1);
		await flush();
	});

	it('abandonment aborts the in-flight fetch and publishes nothing', async () => {
		const gate = deferred<number>();
		const seenSignals: (AbortSignal | undefined)[] = [];
		const fetchWooQueryTotal = vi.fn((input: { signal?: AbortSignal }) => {
			seenSignals.push(input.signal);
			return gate.promise;
		});
		const { runner, cacheEntries } = harness({ fetchWooQueryTotal: fetchWooQueryTotal as never });

		runner.request({ queryKey: 'orders:q', filters: {} });
		await flush();
		runner.abandon({ queryKey: 'orders:q' });

		expect(seenSignals[0]?.aborted).toBe(true);
		gate.resolve(99); // late response — must not publish
		await flush();
		expect(cacheEntries()).toEqual([]);

		// The key is released: a re-request fetches again.
		runner.request({ queryKey: 'orders:q', filters: {} });
		await flush();
		expect(fetchWooQueryTotal).toHaveBeenCalledTimes(2);
	});

	it('skips while offline', async () => {
		const { runner, diagnostics, fetchWooQueryTotal } = harness({ isOffline: () => true });

		runner.request({ queryKey: 'orders:q', filters: {} });
		await flush();

		expect(fetchWooQueryTotal).not.toHaveBeenCalled();
		expect(
			diagnostics.some((d) => d.message.includes('Skipped Woo query total for orders:q: offline'))
		).toBe(true);
	});

	it('a failed fetch surfaces as a diagnostic and publishes nothing', async () => {
		const { runner, diagnostics, cacheEntries } = harness({
			fetchWooQueryTotal: vi.fn(async () => {
				throw new Error('X-WP-Total missing');
			}),
		});

		runner.request({ queryKey: 'orders:q', filters: {} });
		await flush();

		expect(cacheEntries()).toEqual([]);
		expect(
			diagnostics.some(
				(d) => d.level === 'error' && d.message.includes('Woo query total failed for orders:q')
			)
		).toBe(true);
	});
});

describe('mergeQueryTotalCacheEntries', () => {
	it('keeps the freshest entry per queryKey', () => {
		const merged = mergeQueryTotalCacheEntries(
			[{ queryKey: 'a', totalMatchingRecords: 1, freshUntilMs: 10, updatedAtMs: 5 }],
			[
				{ queryKey: 'a', totalMatchingRecords: 2, freshUntilMs: 20, updatedAtMs: 9 },
				{ queryKey: 'b', totalMatchingRecords: 3, freshUntilMs: 20, updatedAtMs: 1 },
			]
		);
		expect(merged).toEqual([
			expect.objectContaining({ queryKey: 'a', totalMatchingRecords: 2 }),
			expect.objectContaining({ queryKey: 'b', totalMatchingRecords: 3 }),
		]);
	});

	it('an older incoming entry does not clobber a newer current one', () => {
		const merged = mergeQueryTotalCacheEntries(
			[{ queryKey: 'a', totalMatchingRecords: 9, freshUntilMs: 30, updatedAtMs: 20 }],
			[{ queryKey: 'a', totalMatchingRecords: 1, freshUntilMs: 10, updatedAtMs: 5 }]
		);
		expect(merged).toEqual([expect.objectContaining({ queryKey: 'a', totalMatchingRecords: 9 })]);
	});
});
