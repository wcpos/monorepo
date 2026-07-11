import { describe, expect, it, vi } from 'vitest';

import {
	composeObservers,
	createLineLogger,
	createMetricsCollector,
	formatSyncEventLine,
	NOOP_OBSERVER,
	type SyncEvent,
} from './telemetry';

const ev = (type: string, over: Partial<SyncEvent> = {}): SyncEvent => ({
	type,
	level: 'info',
	...over,
});

describe('NOOP_OBSERVER', () => {
	it('accepts an event and does nothing', () => {
		expect(() => NOOP_OBSERVER(ev('x'))).not.toThrow();
	});
});

describe('composeObservers', () => {
	it('fans an event out to every observer', () => {
		const a = vi.fn();
		const b = vi.fn();
		composeObservers(a, b)(ev('pull.batch'));
		expect(a).toHaveBeenCalledWith(expect.objectContaining({ type: 'pull.batch' }));
		expect(b).toHaveBeenCalledWith(expect.objectContaining({ type: 'pull.batch' }));
	});

	it('isolates a throwing observer so others still receive the event (best-effort)', () => {
		const boom = vi.fn(() => {
			throw new Error('sink down');
		});
		const ok = vi.fn();
		expect(() => composeObservers(boom, ok)(ev('x'))).not.toThrow();
		expect(ok).toHaveBeenCalledTimes(1);
	});

	it('filters falsy entries (composeObservers(a, cond && b))', () => {
		const a = vi.fn();
		composeObservers(a, false, null, undefined)(ev('x'));
		expect(a).toHaveBeenCalledTimes(1);
	});

	it('returns NOOP when given no real observers', () => {
		expect(composeObservers(false, null)).toBe(NOOP_OBSERVER);
	});

	it('isolates even a single observer (a lone throwing sink does not propagate)', () => {
		const boom = vi.fn(() => {
			throw new Error('x');
		});
		expect(() => composeObservers(boom, false)(ev('x'))).not.toThrow();
		expect(boom).toHaveBeenCalledTimes(1);
	});

	it('freezes the event before fan-out so a sink cannot corrupt it for later sinks', () => {
		let received: SyncEvent | undefined;
		composeObservers((e) => {
			received = e;
		})(ev('x', { fields: { a: 1 } }));
		expect(Object.isFrozen(received)).toBe(true);
	});
});

describe('createMetricsCollector', () => {
	it('tallies events by type and counts errors', () => {
		const m = createMetricsCollector();
		m.observe(ev('pull.batch'));
		m.observe(ev('pull.batch'));
		m.observe(ev('error', { level: 'error' }));
		const snap = m.snapshot();
		expect(snap.events).toEqual({ 'pull.batch': 2, error: 1 });
		expect(snap.errors).toBe(1);
	});

	it('breaks down counts per collection', () => {
		const m = createMetricsCollector();
		m.observe(ev('push.outcome', { collection: 'orders' }));
		m.observe(ev('push.outcome', { collection: 'orders' }));
		m.observe(ev('push.outcome', { collection: 'products' }));
		expect(m.snapshot().byCollection).toEqual({ 'push.outcome': { orders: 2, products: 1 } });
	});

	it('aggregates durationMs into count/total/min/max timings, ignoring non-numeric', () => {
		const m = createMetricsCollector();
		m.observe(ev('change-signal.poll', { fields: { durationMs: 100 } }));
		m.observe(ev('change-signal.poll', { fields: { durationMs: 300 } }));
		m.observe(ev('change-signal.poll', { fields: { durationMs: 'nope' } })); // ignored
		m.observe(ev('change-signal.poll', { fields: {} })); // no durationMs
		expect(m.snapshot().timings['change-signal.poll']).toEqual({
			count: 2,
			totalMs: 400,
			minMs: 100,
			maxMs: 300,
		});
	});

	it('keeps timings separate per collection (orders vs products do not merge)', () => {
		const m = createMetricsCollector();
		m.observe(ev('pull.batch', { collection: 'orders', fields: { durationMs: 100 } }));
		m.observe(ev('pull.batch', { collection: 'products', fields: { durationMs: 300 } }));
		const snap = m.snapshot();
		expect(snap.timings['pull.batch']).toEqual({ count: 2, totalMs: 400, minMs: 100, maxMs: 300 });
		expect(snap.timingsByCollection['pull.batch']).toEqual({
			orders: { count: 1, totalMs: 100, minMs: 100, maxMs: 100 },
			products: { count: 1, totalMs: 300, minMs: 300, maxMs: 300 },
		});
	});

	it('cannot pollute Object.prototype via a malicious __proto__ event type/collection', () => {
		const m = createMetricsCollector();
		m.observe(ev('__proto__', { collection: '__proto__', fields: { durationMs: 1 } }));
		expect(({} as Record<string, unknown>).anything).toBeUndefined();
		expect(Object.getPrototypeOf({})).toBe(Object.prototype);
		expect(Object.prototype.hasOwnProperty.call(m.snapshot().events, '__proto__')).toBe(true);
	});

	it('snapshot is a deep copy — mutating it does not affect the collector', () => {
		const m = createMetricsCollector();
		m.observe(ev('a', { collection: 'orders', fields: { durationMs: 5 } }));
		const snap = m.snapshot();
		snap.events.a = 999;
		snap.byCollection.a.orders = 999;
		snap.timings.a.count = 999;
		const fresh = m.snapshot();
		expect(fresh.events.a).toBe(1);
		expect(fresh.byCollection.a.orders).toBe(1);
		expect(fresh.timings.a.count).toBe(1);
	});

	it('reset zeros every tally', () => {
		const m = createMetricsCollector();
		m.observe(ev('a', { level: 'error', collection: 'orders', fields: { durationMs: 5 } }));
		m.reset();
		expect(m.snapshot()).toEqual({
			events: {},
			byCollection: {},
			timings: {},
			timingsByCollection: {},
			fieldSums: {},
			fieldSumsByCollection: {},
			errors: 0,
		});
	});

	it('sums numeric fields (except durationMs) as throughput, by type and per collection', () => {
		const m = createMetricsCollector();
		m.observe(
			ev('apply.pull', {
				collection: 'products',
				fields: { requested: 50, applied: 48, durationMs: 100 },
			})
		);
		m.observe(
			ev('apply.pull', {
				collection: 'products',
				fields: { requested: 30, applied: 30, durationMs: 80 },
			})
		);
		m.observe(
			ev('apply.pull', { collection: 'variations', fields: { requested: 10, applied: 9 } })
		);
		const snap = m.snapshot();
		// throughput by type — durationMs excluded (it lives in timings, not the sums)
		expect(snap.fieldSums['apply.pull']).toEqual({ requested: 90, applied: 87 });
		expect(snap.fieldSumsByCollection['apply.pull']).toEqual({
			products: { requested: 80, applied: 78 },
			variations: { requested: 10, applied: 9 },
		});
		expect(snap.fieldSums['apply.pull'].durationMs).toBeUndefined();
		expect(snap.timings['apply.pull']).toEqual({ count: 2, totalMs: 180, minMs: 80, maxMs: 100 });
	});

	it('does NOT sum non-additive numeric fields like record ids — only recognized counters', () => {
		const m = createMetricsCollector();
		m.observe(
			ev('apply.escalation', {
				level: 'warn',
				collection: 'products',
				fields: { id: 80, count: 1 },
			})
		);
		m.observe(
			ev('apply.escalation', {
				level: 'warn',
				collection: 'products',
				fields: { id: 99, count: 1 },
			})
		);
		const snap = m.snapshot();
		expect(snap.fieldSums['apply.escalation']).toEqual({ count: 2 }); // ids are NOT summed
	});

	it('honors a custom additiveFields allowlist', () => {
		const m = createMetricsCollector({ additiveFields: ['widgets'] });
		m.observe(ev('x', { fields: { widgets: 3, applied: 5 } }));
		expect(m.snapshot().fieldSums.x).toEqual({ widgets: 3 }); // 'applied' not in the custom list
	});
});

describe('formatSyncEventLine', () => {
	it('renders level + type, then optional collection + message + fields in order', () => {
		expect(formatSyncEventLine(ev('pull.batch'))).toBe('[info] pull.batch');
		expect(formatSyncEventLine(ev('pull.batch', { collection: 'orders' }))).toBe(
			'[info] pull.batch orders'
		);
		expect(
			formatSyncEventLine(
				ev('push.outcome', { level: 'warn', collection: 'products', message: 'partial' })
			)
		).toBe('[warn] push.outcome products partial');
		expect(formatSyncEventLine(ev('x', { fields: { count: 50, ok: true, durationMs: 120 } }))).toBe(
			'[info] x count=50 ok=true durationMs=120'
		);
	});

	it('quotes field values that need it, and renders objects/null/undefined safely', () => {
		expect(formatSyncEventLine(ev('x', { fields: { id: 'woo-order:1' } }))).toBe(
			'[info] x id=woo-order:1'
		);
		expect(formatSyncEventLine(ev('x', { fields: { msg: 'two words' } }))).toBe(
			'[info] x msg="two words"'
		);
		// an object whose JSON has internal whitespace is quoted as one token
		expect(
			formatSyncEventLine(ev('x', { fields: { obj: { m: 'a b' }, n: null, u: undefined } }))
		).toBe('[info] x obj="{\\"m\\":\\"a b\\"}" n=null u=undefined');
	});

	it('quotes a multi-word collection/message so they stay single tokens', () => {
		expect(
			formatSyncEventLine(
				ev('push.outcome', {
					level: 'warn',
					collection: 'products',
					message: 'partial failure',
					fields: { status: 'error' },
				})
			)
		).toBe('[warn] push.outcome products "partial failure" status=error');
	});
});

describe('createLineLogger', () => {
	it('forwards a formatted line to the string sink', () => {
		const sink = vi.fn();
		createLineLogger(sink)(ev('pull.batch', { collection: 'orders', fields: { count: 3 } }));
		expect(sink).toHaveBeenCalledWith('[info] pull.batch orders count=3');
	});

	it('drops events below minLevel, passes those at or above', () => {
		const sink = vi.fn();
		const logger = createLineLogger(sink, { minLevel: 'warn' });
		logger(ev('a', { level: 'debug' }));
		logger(ev('b', { level: 'info' }));
		logger(ev('c', { level: 'warn' }));
		logger(ev('d', { level: 'error' }));
		expect(sink).toHaveBeenCalledTimes(2);
		expect(sink).toHaveBeenNthCalledWith(1, '[warn] c');
		expect(sink).toHaveBeenNthCalledWith(2, '[error] d');
	});

	it('composes with a metrics collector — one emit feeds both', () => {
		const lines: string[] = [];
		const metrics = createMetricsCollector();
		const observe = composeObservers(
			metrics.observe,
			createLineLogger((l) => lines.push(l))
		);
		observe(ev('push.outcome', { collection: 'orders', fields: { status: 'created' } }));
		expect(lines).toEqual(['[info] push.outcome orders status=created']);
		expect(metrics.snapshot().events['push.outcome']).toBe(1);
	});

	it('isolates a throwing host sink even when used as the sole observer', () => {
		const logger = createLineLogger(() => {
			throw new Error('host log down');
		});
		expect(() => logger(ev('x'))).not.toThrow();
	});
});

describe('NOOP_OBSERVER hot-path tripwire', () => {
	it('accepts 10k typical events within a generous CI bound', () => {
		const event = ev('pull.batch', {
			collection: 'orders',
			fields: { documents: 50, requests: 1, durationMs: 12 },
		});
		const started = performance.now();
		for (let index = 0; index < 10_000; index += 1) NOOP_OBSERVER(event);
		expect(performance.now() - started).toBeLessThan(200);
	});
});
