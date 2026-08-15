/**
 * The coverage hub's failure and guard behaviour, driven against a scripted storage stub.
 *
 * The happy paths are covered end-to-end through the public handle in
 * create-rxdb-sync-engine.coverage-changes.test.ts. What needs a stub is the half real storage
 * will not produce on demand: a query stream that ERRORS, and a subscription that must never be
 * opened at all.
 */

import { describe, expect, it, vi } from 'vitest';

import { createCoverageChangeHub } from './coverage-changes';

import type { CoverageVerdict } from './coverage-verdicts';
import type { RxDatabase } from 'rxdb';

type Observer = { next(document: { toJSON(): unknown } | null): void; error(error: unknown): void };

function scriptedTable() {
	const observers: Observer[] = [];
	let unsubscribes = 0;
	const keys: string[] = [];
	return {
		observers,
		keys,
		unsubscribes: () => unsubscribes,
		collection: {
			findOne: (key: string) => {
				keys.push(key);
				return {
					$: {
						subscribe: (observer: Observer) => {
							observers.push(observer);
							return {
								unsubscribe: () => {
									unsubscribes += 1;
								},
							};
						},
					},
				};
			},
		},
	};
}

function harness() {
	const lanes = scriptedTable();
	const totals = scriptedTable();
	const diagnostics = vi.fn();
	const database = {
		collections: { coverageLanes: lanes.collection, queryTotalCacheEntries: totals.collection },
	} as unknown as RxDatabase;
	const hub = createCoverageChangeHub({
		activeDatabase: () => database,
		now: () => 1_000_000,
		diagnostics,
	});
	return { lanes, totals, diagnostics, hub };
}

const FRESH_LANE = {
	laneKey: 'orders::orders:browser:limit=25',
	collectionName: 'orders',
	queryKey: 'orders:browser:limit=25',
	complete: true,
	expectedRecordIds: ['a', 'b'],
	freshUntilMs: 1_060_000,
	updatedAtMs: 1,
	schemaVersion: 3,
};

describe('coverage change hub', () => {
	it('reports a failed lane stream and withdraws the verdict it can no longer maintain', () => {
		const { lanes, diagnostics, hub } = harness();
		const verdicts: CoverageVerdict[] = [];
		hub.subscribe({ collection: 'orders', queryKey: 'orders:browser:limit=25' }, (verdict) =>
			verdicts.push(verdict)
		);
		lanes.observers[0]?.next({ toJSON: () => FRESH_LANE });
		expect(verdicts.at(-1)).toMatchObject({ total: 2, source: 'lane' });

		// A dead stream means nothing is watching the row any more; holding the last answer
		// would present a claim the engine has stopped standing behind.
		lanes.observers[0]?.error(new Error('storage query failed'));

		expect(verdicts.at(-1)).toMatchObject({ total: null, source: 'unknown' });
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'engine.listener-error',
				level: 'error',
				message: expect.stringContaining('coverage lane subscription failed'),
			})
		);
		hub.dispose();
	});

	it('reports a failed query-total stream without disturbing the lane it still has', () => {
		const { lanes, totals, diagnostics, hub } = harness();
		const verdicts: CoverageVerdict[] = [];
		hub.subscribe({ collection: 'orders', queryKey: 'orders:browser:limit=25' }, (verdict) =>
			verdicts.push(verdict)
		);
		lanes.observers[0]?.next({ toJSON: () => FRESH_LANE });
		totals.observers[0]?.next({
			toJSON: () => ({
				queryKey: 'orders:browser:limit=25',
				totalMatchingRecords: 4_200,
				freshUntilMs: 1_060_000,
				updatedAtMs: 1,
				schemaVersion: 1,
			}),
		});
		expect(verdicts.at(-1)).toMatchObject({ total: 4_200, source: 'query-total' });

		totals.observers[0]?.error(new Error('storage query failed'));

		// Falls BACK to the lane rather than all the way to unknown — only the failed row is lost.
		expect(verdicts.at(-1)).toMatchObject({ total: 2, source: 'lane' });
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({
				message: expect.stringContaining('query-total subscription failed'),
			})
		);
		hub.dispose();
	});

	// The query-total table has no collection column, so the key namespace is the only guard
	// there is — and the cheapest way to honour it is to never open the subscription.
	it('never opens a query-total subscription for a key outside the target namespace', () => {
		const { lanes, totals, hub } = harness();
		const verdicts: CoverageVerdict[] = [];
		hub.subscribe({ collection: 'products', queryKey: 'orders:browser:limit=25' }, (verdict) =>
			verdicts.push(verdict)
		);

		expect(totals.observers).toHaveLength(0);
		// The lane arm is still wired: its primary key carries the collection, so it needs no
		// namespace test and correctly addresses `products::orders:browser:limit=25` (nothing).
		expect(lanes.keys).toEqual(['products::orders:browser:limit=25']);
		expect(verdicts.at(-1)).toMatchObject({ total: null, source: 'unknown' });
		hub.dispose();
	});

	it('opens the query-total subscription for a key inside the target namespace', () => {
		const { totals, hub } = harness();
		hub.subscribe({ collection: 'orders', queryKey: 'orders:browser:limit=25' }, () => undefined);

		expect(totals.keys).toEqual(['orders:browser:limit=25']);
		hub.dispose();
	});

	it('drops every storage subscription on dispose', () => {
		const { lanes, totals, hub } = harness();
		hub.subscribe({ collection: 'orders', queryKey: 'orders:browser:limit=25' }, () => undefined);

		hub.dispose();

		expect(lanes.unsubscribes()).toBe(1);
		expect(totals.unsubscribes()).toBe(1);
	});
});
