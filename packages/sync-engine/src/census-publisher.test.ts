import { describe, expect, it, vi } from 'vitest';

import { createCensusPublisher } from './census-publisher';

import type { EngineTimers } from './engine-timers';
import type { QueryTotalCacheEntry } from './scheduler';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((onResolve) => {
		resolve = onResolve;
	});
	return { promise, resolve };
}

function entry(total: number, freshUntilMs = 200): QueryTotalCacheEntry {
	return {
		queryKey: 'census:customers',
		totalMatchingRecords: total,
		updatedAtMs: 50,
		freshUntilMs,
	};
}

function timerHarness() {
	const callbacks: (() => void)[] = [];
	const timers: EngineTimers = {
		setTimeout: vi.fn((callback: () => void) => {
			callbacks.push(callback);
			return callbacks.length as unknown as ReturnType<typeof setTimeout>;
		}),
		clearTimeout: vi.fn(),
		setInterval: vi.fn(),
		clearInterval: vi.fn(),
		unref: vi.fn(),
	};
	return { callbacks, timers };
}

describe('createCensusPublisher', () => {
	it('drops an in-flight cache read after dispose without rearming', async () => {
		const read = deferred<QueryTotalCacheEntry[]>();
		const listener = vi.fn();
		const { timers } = timerHarness();
		const publisher = createCensusPublisher({
			cache: { readForQueryKeys: () => read.promise },
			now: () => 100,
			diagnostics: vi.fn(),
			timers,
		});
		publisher.subscribe(listener);
		publisher.dispose();
		read.resolve([entry(3)]);
		await read.promise;
		await Promise.resolve();
		expect(listener).not.toHaveBeenCalled();
		expect(timers.setTimeout).not.toHaveBeenCalled();
	});

	it('lets the newest publish win when cache reads settle out of order', async () => {
		const first = deferred<QueryTotalCacheEntry[]>();
		const second = deferred<QueryTotalCacheEntry[]>();
		const reads = [first, second];
		const listener = vi.fn();
		const { timers } = timerHarness();
		const publisher = createCensusPublisher({
			cache: { readForQueryKeys: () => reads.shift()!.promise },
			now: () => 100,
			diagnostics: vi.fn(),
			timers,
		});
		publisher.subscribe(listener);
		publisher.publish();
		second.resolve([entry(2, 100)]);
		await second.promise;
		await Promise.resolve();
		first.resolve([entry(1, 100)]);
		await first.promise;
		await Promise.resolve();
		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener.mock.calls[0]![0].customers?.total).toBe(2);
	});

	it('retries a failed expiry read and resumes freshness publishing', async () => {
		const { callbacks, timers } = timerHarness();
		const diagnostics = vi.fn();
		const listener = vi.fn();
		const cache = {
			readForQueryKeys: vi
				.fn()
				.mockResolvedValueOnce([entry(4, 110)])
				.mockRejectedValueOnce(new Error('transient read failure'))
				.mockResolvedValueOnce([entry(5, 200)]),
		};
		const publisher = createCensusPublisher({
			cache,
			now: () => 100,
			diagnostics,
			timers,
		});
		publisher.subscribe(listener);
		await Promise.resolve();
		await Promise.resolve();

		callbacks[0]!();
		await Promise.resolve();
		await Promise.resolve();
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({ message: expect.stringContaining('transient read failure') })
		);
		expect(timers.setTimeout).toHaveBeenCalledTimes(2);

		callbacks[1]!();
		await Promise.resolve();
		await Promise.resolve();
		expect(cache.readForQueryKeys).toHaveBeenCalledTimes(3);
		expect(listener).toHaveBeenLastCalledWith(
			expect.objectContaining({ customers: expect.objectContaining({ total: 5 }) })
		);
	});

	it('re-publishes just after the next freshness deadline', async () => {
		const { callbacks, timers } = timerHarness();
		const cache = { readForQueryKeys: vi.fn().mockResolvedValue([entry(4, 110)]) };
		const publisher = createCensusPublisher({
			cache,
			now: () => 100,
			diagnostics: vi.fn(),
			timers,
		});
		publisher.subscribe(vi.fn());
		await Promise.resolve();
		await Promise.resolve();
		expect(timers.setTimeout).toHaveBeenCalledWith(expect.any(Function), 11);
		callbacks[0]!();
		await Promise.resolve();
		expect(cache.readForQueryKeys).toHaveBeenCalledTimes(2);
	});

	it('reads a single fresh entry for collection completeness checks', async () => {
		const publisher = createCensusPublisher({
			cache: { readForQueryKeys: vi.fn().mockResolvedValue([entry(7)]) },
			now: () => 100,
			diagnostics: vi.fn(),
		});
		expect((await publisher.freshEntry('customers'))?.totalMatchingRecords).toBe(7);
	});

	it('takes the freshness timestamp after the cache read settles', async () => {
		const read = deferred<QueryTotalCacheEntry[]>();
		let nowMs = 100;
		const publisher = createCensusPublisher({
			cache: { readForQueryKeys: () => read.promise },
			now: () => nowMs,
			diagnostics: vi.fn(),
		});
		const pending = publisher.freshEntry('customers');
		nowMs = 200;
		read.resolve([entry(7, 150)]);

		await expect(pending).resolves.toBeNull();
	});

	it('reads a fresh entry from the captured database after the active database changes', async () => {
		const firstDatabase = { name: 'first' };
		const secondDatabase = { name: 'second' };
		const entries = new Map([
			[firstDatabase, entry(7)],
			[secondDatabase, entry(9)],
		]);
		let activeDatabase = firstDatabase;
		const publisher = createCensusPublisher<typeof firstDatabase>({
			cache: {
				readForQueryKeys: async (_keys: string[], database = activeDatabase) => [
					entries.get(database)!,
				],
			},
			now: () => 100,
			diagnostics: vi.fn(),
		});
		const capturedDatabase = activeDatabase;
		activeDatabase = secondDatabase;

		const capturedEntry = await publisher.freshEntry('customers', capturedDatabase);
		expect(capturedEntry?.totalMatchingRecords).toBe(7);
		expect((await publisher.freshEntry('customers'))?.totalMatchingRecords).toBe(9);
	});
});
