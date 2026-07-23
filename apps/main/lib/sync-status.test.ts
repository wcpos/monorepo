// Reset at module scope to avoid jest-expo's winter-runtime "require outside test scope" error.
import type { SyncEvent } from '@wcpos/sync-core';

import {
	foldSyncStatus,
	getSyncStatusEpoch,
	getSyncStatusState,
	hydrateSyncStatus,
	resetSyncStatus,
	subscribeSyncStatus,
	syncStatusObserver,
	type SyncStatusState,
} from './sync-status';

jest.resetModules();

const event = (partial: Partial<SyncEvent> & { type: string }): SyncEvent =>
	({ level: 'info', ...partial }) as SyncEvent;

describe('foldSyncStatus', () => {
	it('stamps lastCheckedAt for every collectionsChecked on signal.cycle', () => {
		const next = foldSyncStatus(
			{},
			event({
				type: 'signal.cycle',
				fields: {
					collectionsChecked: ['products', 'customers'],
					pulls: 0,
					deletes: 0,
					durationMs: 12,
				},
			}),
			111
		);
		expect(next.products.lastCheckedAt).toBe(111);
		expect(next.customers.lastCheckedAt).toBe(111);
		expect(next.products.lastChangedAt).toBeNull();
	});

	it('stamps orders.lastCheckedAt from a ran order-window-seed lane tick', () => {
		const next = foldSyncStatus(
			{},
			event({
				type: 'engine.lane.tick',
				fields: { lane: 'order-window-seed', status: 'ran', durationMs: 5 },
			}),
			222
		);
		expect(next.orders.lastCheckedAt).toBe(222);
	});

	it('ignores skipped and error lane ticks', () => {
		const skipped = foldSyncStatus(
			{},
			event({ type: 'engine.lane.tick', fields: { lane: 'order-window-seed', status: 'skipped' } }),
			222
		);
		expect(skipped).toEqual({});
	});

	it('stamps lastChangedAt on apply.pull/apply.delete with applied > 0 only', () => {
		const changed = foldSyncStatus(
			{},
			event({ type: 'apply.pull', collection: 'products', fields: { requested: 2, applied: 2 } }),
			333
		);
		expect(changed.products.lastChangedAt).toBe(333);
		const idle = foldSyncStatus(
			{},
			event({ type: 'apply.pull', collection: 'products', fields: { requested: 0, applied: 0 } }),
			333
		);
		expect(idle).toEqual({});
	});

	it('records lastError for collection-scoped warn/error events', () => {
		const next = foldSyncStatus(
			{},
			event({ type: 'push.error', level: 'error', collection: 'orders', message: 'HTTP 500' }),
			444
		);
		expect(next.orders.lastError).toEqual({ at: 444, type: 'push.error', message: 'HTTP 500' });
	});

	it('returns the same reference when the event is irrelevant', () => {
		const state: SyncStatusState = {};
		expect(
			foldSyncStatus(state, event({ type: 'transport.request', fields: { status: 200 } }), 1)
		).toBe(state);
	});
});

describe('sync status store', () => {
	beforeEach(() => {
		resetSyncStatus();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('folds observed events into the module store', () => {
		jest.spyOn(Date, 'now').mockReturnValue(555);
		syncStatusObserver(
			event({
				type: 'signal.cycle',
				fields: { collectionsChecked: ['products'], pulls: 0, deletes: 0, durationMs: 1 },
			})
		);
		expect(getSyncStatusState().products.lastCheckedAt).toBe(555);
	});

	it('clears state and bumps the epoch on reset', () => {
		hydrateSyncStatus({
			products: { lastCheckedAt: 10, lastChangedAt: null, lastError: null },
		});
		const epoch = getSyncStatusEpoch();
		resetSyncStatus();
		expect(getSyncStatusState()).toEqual({});
		expect(getSyncStatusEpoch()).toBe(epoch + 1);
	});

	it('hydrates each field with the newer persisted or in-memory value', () => {
		hydrateSyncStatus({
			products: {
				lastCheckedAt: 200,
				lastChangedAt: 100,
				lastError: { at: 300, type: 'live.error', message: 'live' },
			},
			customers: {
				lastCheckedAt: 100,
				lastChangedAt: null,
				lastError: { at: 100, type: 'old.error', message: 'old' },
			},
		});
		hydrateSyncStatus({
			products: {
				lastCheckedAt: 100,
				lastChangedAt: 200,
				lastError: { at: 200, type: 'old.error', message: 'old' },
			},
			customers: {
				lastCheckedAt: 200,
				lastChangedAt: null,
				lastError: { at: 200, type: 'new.error', message: 'new' },
			},
		});
		expect(getSyncStatusState()).toEqual({
			products: {
				lastCheckedAt: 200,
				lastChangedAt: 200,
				lastError: { at: 300, type: 'live.error', message: 'live' },
			},
			customers: {
				lastCheckedAt: 200,
				lastChangedAt: null,
				lastError: { at: 200, type: 'new.error', message: 'new' },
			},
		});
	});

	it('notifies subscribers on state change until they unsubscribe', () => {
		const listener = jest.fn();
		const unsubscribe = subscribeSyncStatus(listener);
		syncStatusObserver(event({ type: 'transport.request', fields: { status: 200 } }));
		expect(listener).not.toHaveBeenCalled();
		syncStatusObserver(
			event({
				type: 'apply.pull',
				collection: 'products',
				fields: { requested: 1, applied: 1 },
			})
		);
		expect(listener).toHaveBeenCalledTimes(1);
		unsubscribe();
		syncStatusObserver(
			event({
				type: 'apply.pull',
				collection: 'customers',
				fields: { requested: 1, applied: 1 },
			})
		);
		expect(listener).toHaveBeenCalledTimes(1);
	});
});
