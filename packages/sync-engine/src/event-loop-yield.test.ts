import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	createMessageChannelHop,
	forEachYielding,
	resetMacrotaskHopForTesting,
	yieldToEventLoop,
} from './event-loop-yield';

/**
 * These assertions are written against the NODE host, where `yieldToEventLoop` resolves through
 * `setImmediate`. That makes the interleaving deterministic — the check-phase queue is FIFO, so a
 * callback registered before the yield always runs before the yield's continuation — which is what
 * lets a yield COUNT be asserted rather than merely reported. The point being pinned is
 * host-independent: control reaches the event loop between chunks.
 */

/** A self-rearming macrotask; its tick count is the number of turns the loop got. */
function countLoopTurns(): { turns: () => number; stop: () => void } {
	let turns = 0;
	let running = true;
	const rearm = () => {
		if (!running) return;
		turns += 1;
		setImmediate(rearm);
	};
	setImmediate(rearm);
	return { turns: () => turns, stop: () => void (running = false) };
}

describe('yieldToEventLoop', () => {
	it('resolves on a MACROtask, so a queued task runs before the continuation', async () => {
		// The whole point: `await Promise.resolve()` would NOT let this run, because the microtask
		// queue drains before the event loop ever reaches a task queue.
		const order: string[] = [];
		setImmediate(() => order.push('task'));

		await yieldToEventLoop();
		order.push('resumed');

		expect(order).toEqual(['task', 'resumed']);
	});

	it('resolves undefined and can be awaited repeatedly', async () => {
		await expect(yieldToEventLoop()).resolves.toBeUndefined();
		await expect(yieldToEventLoop()).resolves.toBeUndefined();
	});
});

describe('host primitive selection', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		resetMacrotaskHopForTesting();
	});

	it('never picks setImmediate on React Native, where it is a microtask shim', async () => {
		// RN shims setImmediate straight onto queueMicrotask
		// (react-native/Libraries/Core/Timers/immediateShim.js), so selecting it there would yield
		// to NOTHING — the walk would still block rendering and input on the POS's primary host.
		resetMacrotaskHopForTesting();
		const shimCalls: number[] = [];
		vi.stubGlobal('navigator', { product: 'ReactNative' });
		vi.stubGlobal('setImmediate', (callback: () => void) => {
			shimCalls.push(1);
			queueMicrotask(callback);
			return 0;
		});

		let timerRan = false;
		setTimeout(() => void (timerRan = true), 0);
		await yieldToEventLoop();

		expect(shimCalls).toEqual([]); // RN's shim was never used
		expect(timerRan).toBe(true); // and a REAL macrotask boundary was crossed
	});
});

describe('createMessageChannelHop (the Safari/Firefox branch)', () => {
	it('resolves EVERY overlapping hop — three reconcile ports yield concurrently', async () => {
		// A single shared resolver slot would let the later caller overwrite the earlier one, and
		// the earlier walk's promise would never settle: a permanent hang, not a slow sync.
		const hop = createMessageChannelHop();
		const settled: string[] = [];

		await Promise.all([
			hop().then(() => void settled.push('a')),
			hop().then(() => void settled.push('b')),
			hop().then(() => void settled.push('c')),
		]);

		expect(settled.sort()).toEqual(['a', 'b', 'c']);
	});

	it('stays usable across sequential hops', async () => {
		const hop = createMessageChannelHop();
		await hop();
		await hop();
		await expect(hop()).resolves.toBeUndefined();
	});
});

describe('forEachYielding', () => {
	it('visits every item once, in order', async () => {
		const seen: number[] = [];
		await forEachYielding([10, 20, 30, 40, 50], 2, (item) => seen.push(item));
		expect(seen).toEqual([10, 20, 30, 40, 50]);
	});

	it('passes the index alongside the item', async () => {
		const pairs: [string, number][] = [];
		await forEachYielding(['a', 'b', 'c'], 2, (item, index) => pairs.push([item, index]));
		expect(pairs).toEqual([
			['a', 0],
			['b', 1],
			['c', 2],
		]);
	});

	it('yields between chunks — never before the first, never after the last', async () => {
		// 7 items at a chunk size of 2 crosses three boundaries (after items 2, 4 and 6).
		const loop = countLoopTurns();
		await forEachYielding([1, 2, 3, 4, 5, 6, 7], 2, () => undefined);
		loop.stop();

		expect(loop.turns()).toBe(3);
	});

	it('does not yield at all when everything fits in one chunk', async () => {
		const loop = countLoopTurns();
		await forEachYielding([1, 2, 3], 10, () => undefined);
		loop.stop();

		expect(loop.turns()).toBe(0);
	});

	it('handles an empty list without yielding', async () => {
		const seen: number[] = [];
		await expect(forEachYielding([], 5, (item) => seen.push(item))).resolves.toBeUndefined();
		expect(seen).toEqual([]);
	});

	it('rejects a chunk size that would loop forever or never yield', async () => {
		for (const chunkSize of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			await expect(forEachYielding([1, 2, 3], chunkSize, () => undefined)).rejects.toThrow(
				RangeError
			);
		}
	});

	it('propagates a visitor throw instead of swallowing it mid-walk', async () => {
		const seen: number[] = [];
		await expect(
			forEachYielding([1, 2, 3, 4], 2, (item) => {
				if (item === 3) throw new Error('boom');
				seen.push(item);
			})
		).rejects.toThrow('boom');
		expect(seen).toEqual([1, 2]);
	});
});
