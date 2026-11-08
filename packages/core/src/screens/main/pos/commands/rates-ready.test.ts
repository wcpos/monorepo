import { BehaviorSubject, Subject } from 'rxjs';

import { readCoverageGeneration } from '@wcpos/query';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { ratesReady } from './rates-ready';

const coverage = new BehaviorSubject({ complete: true });
jest.mock('@wcpos/query', () => ({
	observeCoverage: () => coverage,
	readCoverageGeneration: jest.fn(() => 1),
}));

function harness() {
	const events = new Subject<{ type: string }>();
	const engine = {
		events: (fn: (event: { type: string }) => void) => {
			const sub = events.subscribe(fn);
			return () => sub.unsubscribe();
		},
	} as unknown as RxdbSyncEngine;
	const rates = ratesReady(engine);
	const seen: boolean[] = [];
	const sub = rates.ready$.subscribe((value) => seen.push(value.ready));
	return { engine, events, rates, seen, stop: () => sub.unsubscribe() };
}
beforeEach(() => {
	coverage.next({ complete: true });
	jest.mocked(readCoverageGeneration).mockReturnValue(1);
});

it('starts shut and opens only when the generation landed and the rates read answered', () => {
	const { rates, seen } = harness();
	expect(seen).toEqual([false]);
	// #3186: coverage complete, but the rates are still the unbound placeholder.
	rates.publish(true, 1, false);
	expect(seen.at(-1)).toBe(false);
	rates.publish(true, 1, true);
	expect(seen.at(-1)).toBe(true);
});

it('#3243 an incomplete verdict in a landed generation never pulses ready false', () => {
	const { rates, seen } = harness();
	const stop = rates.watch();
	rates.publish(true, 1, true);
	seen.length = 0;
	// Compaction deletes the lane: the verdict goes unknown, the generation stays.
	coverage.next({ complete: false });
	rates.publish(false, 1, true);
	expect(seen).not.toContain(false);
	stop();
});

it('#3243 the landed generation outlives the instance: a remount on the same engine opens', () => {
	const { engine, rates } = harness();
	rates.publish(true, 1, true);
	const again = ratesReady(engine);
	let ready: boolean | undefined;
	again.ready$.subscribe((value) => (ready = value.ready)).unsubscribe();
	expect(ready).toBe(false);
	again.publish(false, 1, true);
	again.ready$.subscribe((value) => (ready = value.ready)).unsubscribe();
	expect(ready).toBe(true);
});

it('a new generation waits for its own complete verdict', () => {
	const { rates, seen } = harness();
	const stop = rates.watch();
	rates.publish(true, 1, true);
	jest.mocked(readCoverageGeneration).mockReturnValue(2);
	coverage.next({ complete: false });
	expect(seen.at(-1)).toBe(false);
	rates.publish(false, 2, true);
	expect(seen.at(-1)).toBe(false);
	rates.publish(true, 2, true);
	expect(seen.at(-1)).toBe(true);
	stop();
});

it.each(['scope-switched', 'collection-reset'])('shuts on %s until the next publish', (type) => {
	const { rates, events, seen } = harness();
	const stop = rates.watch();
	rates.publish(true, 1, true);
	events.next({ type });
	expect(seen.at(-1)).toBe(false);
	rates.publish(true, 1, true);
	expect(seen.at(-1)).toBe(true);
	stop();
	events.next({ type });
	expect(seen.at(-1)).toBe(true);
	expect(coverage.observed).toBe(false);
});
