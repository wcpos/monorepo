// jest-expo's winter-runtime global proxies throw "require outside test scope"
// unless the registry is reset at module scope (same root cause as the loadX()
// pattern in metrics.test.ts / create-app-engine.test.ts).
import type { SyncEvent } from '@wcpos/sync-core';
import type { LogTerminalFields } from '@wcpos/utils/logger';

import { createSyncLogObserver } from './sync-log-observer';

jest.resetModules();

const event = (partial: Partial<SyncEvent> & { type: string }): SyncEvent =>
	({ level: 'info', ...partial }) as SyncEvent;

describe('createSyncLogObserver', () => {
	let rows: {
		level: string;
		message: string;
		context: Record<string, unknown>;
		terminal?: LogTerminalFields;
	}[];
	let observer: ReturnType<typeof createSyncLogObserver>;

	beforeEach(() => {
		rows = [];
		observer = createSyncLogObserver({
			persist: (level, message, context, terminal) =>
				rows.push({ level, message, context, terminal }),
			nowMs: () => 2_000,
		});
	});

	it('does not rate-limit repeated record failures', () => {
		for (let index = 0; index < 5; index += 1) {
			observer.observe(
				event({
					type: 'push.error',
					level: 'error',
					collection: 'orders',
					fields: { recordId: '4711' },
				})
			);
		}

		expect(rows).toHaveLength(5);
	});

	it('persists signal cycles only when they did work and promotes duration fields', () => {
		observer.observe(
			event({
				type: 'signal.cycle',
				at: 1_500,
				fields: { pulls: 0, deletes: 0, durationMs: 100 },
			})
		);
		observer.observe(
			event({
				type: 'signal.cycle',
				at: 1_500,
				fields: { pulls: 2, deletes: 0, durationMs: 100 },
			})
		);

		expect(rows).toHaveLength(1);
		expect(rows[0].terminal).toMatchObject({
			operationType: 'sync.cycle',
			outcome: 'ok',
			durationMs: 100,
			startedAt: 1_400,
		});
	});

	it('marks failed lane ticks as failed terminal rows', () => {
		observer.observe(
			event({
				type: 'engine.lane.tick',
				fields: {
					status: 'error',
					pushed: 0,
					conflicts: 0,
					deferred: 0,
					failed: 0,
					rejected: 0,
				},
			})
		);

		expect(rows[0].terminal).toMatchObject({
			operationType: 'sync.lane',
			outcome: 'failed',
		});
	});

	it('persists cursor anomalies as unknown warn rows with cursor context', () => {
		observer.observe(
			event({
				type: 'signal.cursor',
				level: 'warn',
				message: 'change-signal: cursor reset to zero',
				fields: { reason: 'reset', from: 5, to: 0 },
			})
		);

		expect(rows).toEqual([
			expect.objectContaining({
				level: 'warn',
				context: expect.objectContaining({ reason: 'reset', from: 5, to: 0 }),
				terminal: { operationType: 'sync.cursor', outcome: 'unknown' },
			}),
		]);
	});

	it('names rejected records and preserves searchable record context', () => {
		observer.observe(
			event({
				type: 'push.rejected',
				level: 'warn',
				collection: 'orders',
				fields: {
					recordId: '4711',
					status: 400,
					reason: 'pos_data_invalid',
					mutationId: 'mutation-1',
				},
			})
		);

		expect(rows[0]).toMatchObject({
			level: 'warn',
			message: 'orders 4711 — rejected by server (HTTP 400: pos_data_invalid)',
			context: {
				type: 'push.rejected',
				recordId: '4711',
				collection: 'orders',
				direction: 'push',
				mutationId: 'mutation-1',
				status: 400,
				reason: 'pos_data_invalid',
			},
			terminal: { operationType: 'sync.record', outcome: 'rejected' },
		});
	});

	it('sanitizes and truncates server reasons in record rows', () => {
		const reason = `Contact customer@example.com ${'x'.repeat(220)}`;
		observer.observe(
			event({
				type: 'push.error',
				level: 'error',
				collection: 'orders',
				fields: { recordId: '1', reason },
			})
		);

		expect(rows[0].context.reason).toHaveLength(200);
		expect(rows[0].context.reason).toContain('[redacted]');
		expect(String(rows[0].context.reason).endsWith('…')).toBe(true);
		expect(rows[0].message).not.toContain('customer@example.com');
	});

	// Regression: the did-work gate must never suppress a warn/error event.
	// `queue.scheduler.drain` raises its level to 'error' on completionLost /
	// failureLost / renewalLost while `succeeded` and `failed` are both 0
	// (maintenance-lanes.ts), so gating on those counters silently dropped the
	// lost-work evidence this observer exists to preserve.
	it('never lets the did-work gate drop a failure-level event', () => {
		observer.observe(
			event({
				type: 'queue.scheduler.drain',
				level: 'error',
				fields: { scanned: 3, succeeded: 0, failed: 0, completionLost: 1 },
			})
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			level: 'error',
			terminal: { operationType: 'sync.queue', outcome: 'failed' },
		});
		expect(rows[0].context).toMatchObject({ completionLost: 1 });
	});

	it('strips credential-bearing query strings out of server reasons', () => {
		observer.observe(
			event({
				type: 'push.error',
				level: 'error',
				collection: 'products',
				fields: { recordId: '9', reason: 'GET /wp-json/wc/v3?consumer_key=abc123 failed' },
			})
		);

		expect(rows[0].context.reason).toBe('GET /wp-json/wc/v3[redacted] failed');
		expect(rows[0].context.reason).not.toContain('consumer_key');
		expect(rows[0].message).not.toContain('consumer_key');
	});

	// Review #854: apply.escalation names the affected record as `id`, not
	// `recordId`, so the row fell back to a generic message and lost its collapse key.
	it('names the escalated record from an `id` field and carries it in context', () => {
		observer.observe(
			event({
				type: 'apply.escalation',
				level: 'warn',
				collection: 'products',
				fields: { id: 88, status: 'drifted', detector: 'revision-hash' },
			})
		);

		expect(rows[0].message).toBe('products 88 — pull escalation');
		expect(rows[0].context).toMatchObject({ recordId: 88, direction: 'pull' });
	});

	// Review #854: a table outcome is the SUCCESS-path outcome. A row may only wear
	// it when the event actually succeeded, or filtering by outcome hides incidents.
	it('derives a failed outcome from a raised level', () => {
		observer.observe(
			event({ type: 'apply.pull', level: 'warn', collection: 'orders', fields: { applied: 2 } })
		);

		expect(rows[0].terminal).toMatchObject({ operationType: 'sync.apply', outcome: 'failed' });
	});

	it('derives a failed outcome from counters even when the level stays info', () => {
		observer.observe(
			event({
				type: 'queue.write.drain',
				fields: { scanned: 5, pushed: 3, conflicts: 0, failed: 0, rejected: 2 },
			})
		);

		expect(rows[0]).toMatchObject({
			level: 'info',
			terminal: { operationType: 'sync.queue', outcome: 'failed' },
		});
	});

	it('keeps a deliberate non-ok classification instead of overriding it to failed', () => {
		observer.observe(
			event({
				type: 'push.rejected',
				level: 'warn',
				collection: 'orders',
				fields: { recordId: '7', status: 400 },
			})
		);

		expect(rows[0].terminal).toMatchObject({ outcome: 'rejected' });
	});

	it('drops a no-op coverage compaction and keeps one that removed rows', () => {
		observer.observe(event({ type: 'coverage.compacted', fields: { removed: 0 } }));
		expect(rows).toHaveLength(0);

		observer.observe(event({ type: 'coverage.compacted', fields: { removed: 4 } }));
		expect(rows).toHaveLength(1);
	});

	it('persists only failed HTTP attempts, never successful ones', () => {
		observer.observe(event({ type: 'transport.request', fields: { status: 200, bytes: 9_000 } }));
		observer.observe(event({ type: 'transport.request', fields: { status: 304, bytes: 0 } }));
		observer.observe(
			event({ type: 'transport.request', level: 'warn', fields: { status: 503, bytes: 0 } })
		);

		expect(rows).toHaveLength(1);
		expect(rows[0].context).toMatchObject({ status: 503 });
	});

	it('persists unmapped failures and drops unmapped info narration', () => {
		observer.observe(event({ type: 'new.failure', level: 'error', message: 'boom' }));
		observer.observe(event({ type: 'new.narration', level: 'info' }));

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			level: 'error',
			message: 'boom',
			terminal: { operationType: 'sync.other', outcome: 'failed' },
		});
	});

	it('does not resolve inherited Object members as conformance entries', () => {
		for (const type of ['constructor', 'toString', 'hasOwnProperty']) {
			observer.observe(event({ type, fields: { applied: 5 } }));
		}

		expect(rows).toHaveLength(0);
	});

	it('persists transport requests only for work or failures', () => {
		observer.observe(event({ type: 'transport.request', fields: { status: 200, bytes: 0 } }));
		observer.observe(
			event({
				type: 'transport.request',
				level: 'warn',
				fields: { status: 500, bytes: 0 },
			})
		);

		expect(rows).toHaveLength(1);
		expect(rows[0].terminal).toMatchObject({
			operationType: 'sync.http',
			outcome: 'failed',
		});
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
});
