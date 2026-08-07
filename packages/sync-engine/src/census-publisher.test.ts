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
		const publisher = createCensusPublisher({
			cache: { readForQueryKeys: () => reads.shift()!.promise },
			now: () => 100,
			diagnostics: vi.fn(),
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
});
