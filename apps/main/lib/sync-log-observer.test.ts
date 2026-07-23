// jest-expo's winter-runtime global proxies throw "require outside test scope"
// unless the registry is reset at module scope (same root cause as the loadX()
// pattern in metrics.test.ts / create-app-engine.test.ts).
import type { SyncEvent } from '@wcpos/sync-core';

import { createSyncLogObserver } from './sync-log-observer';

jest.resetModules();

const event = (partial: Partial<SyncEvent> & { type: string }): SyncEvent =>
	({ level: 'info', ...partial }) as SyncEvent;

describe('createSyncLogObserver', () => {
	let rows: { level: string; message: string; context: Record<string, unknown> }[];
	let now: number;
	let observer: ReturnType<typeof createSyncLogObserver>;

	beforeEach(() => {
		rows = [];
		now = 1_000_000;
		observer = createSyncLogObserver({
			persist: (level, message, context) => rows.push({ level, message, context }),
			nowMs: () => now,
		});
	});

	it('persists every warn/error event', () => {
		observer.observe(
			event({
				type: 'push.error',
				level: 'error',
				collection: 'orders',
				message: 'boom',
				fields: { status: 500 },
			})
		);
		observer.observe(event({ type: 'queue.write.needs-revision', level: 'warn' }));
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			level: 'error',
			message: 'boom',
			context: { type: 'push.error', collection: 'orders', status: 500 },
		});
	});

	it('rate-limits per (type, collection) and folds a suppressed count into the next row', () => {
		for (let i = 0; i < 5; i++)
			observer.observe(event({ type: 'push.error', level: 'error', collection: 'orders' }));
		expect(rows).toHaveLength(1);
		now += 61_000;
		observer.observe(event({ type: 'push.error', level: 'error', collection: 'orders' }));
		expect(rows).toHaveLength(2);
		expect(rows[1].context.suppressed).toBe(4);
	});

	it('does not rate-limit across different collections of the same type', () => {
		observer.observe(event({ type: 'push.error', level: 'error', collection: 'orders' }));
		observer.observe(event({ type: 'push.error', level: 'error', collection: 'products' }));
		expect(rows).toHaveLength(2);
	});

	it('persists allowlisted info events only when they did work', () => {
		observer.observe(
			event({ type: 'apply.pull', collection: 'products', fields: { requested: 3, applied: 3 } })
		);
		observer.observe(
			event({ type: 'apply.pull', collection: 'products', fields: { requested: 0, applied: 0 } })
		);
		observer.observe(
			event({
				type: 'queue.write.drain',
				fields: {
					scanned: 9,
					attempted: 0,
					pushed: 0,
					deferred: 0,
					conflicts: 0,
					failed: 0,
					rejected: 0,
				},
			})
		);
		observer.observe(
			event({
				type: 'queue.write.drain',
				fields: {
					scanned: 9,
					attempted: 2,
					pushed: 2,
					deferred: 0,
					conflicts: 0,
					failed: 0,
					rejected: 0,
				},
			})
		);
		observer.observe(
			event({
				type: 'coverage.existence-reconcile',
				fields: { buckets: 4, pruned: 0, pulled: 2, repulled: 0, skippedDirty: 0, durationMs: 40 },
			})
		);
		expect(rows.map((r) => r.context.type)).toEqual([
			'apply.pull',
			'queue.write.drain',
			'coverage.existence-reconcile',
		]);
	});

	it('never persists non-allowlisted info or any debug events', () => {
		observer.observe(event({ type: 'signal.cycle', fields: { pulls: 3, deletes: 0 } }));
		observer.observe(event({ type: 'push.outcome', fields: { outcome: 'created' } }));
		observer.observe(event({ type: 'transport.request', fields: { status: 200 } }));
		observer.observe(event({ type: 'signal.log', level: 'debug', message: 'noise' }));
		expect(rows).toHaveLength(0);
	});

	it('never persists info events whose type is an inherited Object member', () => {
		for (const type of ['constructor', 'toString', 'hasOwnProperty']) {
			observer.observe(event({ type, fields: { applied: 5 } }));
		}
		expect(rows).toHaveLength(0);
	});

	it('normalizes engine camelCase collections to snake_case in persisted rows', () => {
		observer.observe(
			event({
				type: 'coverage.require.error',
				level: 'error',
				collection: 'taxRates',
				message: 'boom',
			})
		);
		expect(rows[0].context.collection).toBe('tax_rates');
	});

	it('shares one rate-limit window across engine and apply vocabularies for a collection', () => {
		observer.observe(
			event({ type: 'coverage.require.error', level: 'error', collection: 'taxRates' })
		);
		observer.observe(
			event({ type: 'coverage.require.error', level: 'error', collection: 'tax_rates' })
		);
		expect(rows).toHaveLength(1);
	});

	it('reset() clears rate-limit windows', () => {
		observer.observe(event({ type: 'push.error', level: 'error' }));
		observer.observe(event({ type: 'push.error', level: 'error' }));
		observer.reset();
		observer.observe(event({ type: 'push.error', level: 'error' }));
		expect(rows).toHaveLength(2);
		expect(rows[1].context.suppressed).toBeUndefined();
	});
});
