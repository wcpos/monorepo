// jest-expo's winter-runtime global proxies throw "require outside test scope"
// unless the registry is reset at module scope (same root cause as the loadX()
// pattern in metrics.test.ts / create-app-engine.test.ts).
import type { SyncEvent } from '@wcpos/sync-core';
import { isVerboseDiagnostics, type LogTerminalFields, promoteRecorder } from '@wcpos/utils/logger';
import type { ErrorCode } from '@wcpos/utils/logger/generated/error-codes.generated';

import { CONFORMANCE_TABLE, createSyncLogObserver } from './sync-log-observer';

jest.mock('@wcpos/utils/logger', () => ({
	isVerboseDiagnostics: jest.fn(() => false),
	promoteRecorder: jest.fn(() => Promise.resolve(0)),
}));

jest.resetModules();

const isVerboseDiagnosticsMock = jest.mocked(isVerboseDiagnostics);
const promoteRecorderMock = jest.mocked(promoteRecorder);

// `type` is widened back to `string` on purpose. `SyncEventType` closes the
// vocabulary at compile time, but the observer still has to survive a name from
// outside it at RUNTIME — a newer engine bundle under an older app shell, or a
// key that resolves through Object.prototype — and those cases are tested below.
const event = (partial: Partial<Omit<SyncEvent, 'type'>> & { type: string }): SyncEvent =>
	({ level: 'info', ...partial }) as SyncEvent;

describe('createSyncLogObserver', () => {
	let rows: {
		level: string;
		message: string;
		context: Record<string, unknown>;
		terminal?: LogTerminalFields;
		toast?: { title: string; description?: string };
		code?: ErrorCode;
	}[];
	let observer: ReturnType<typeof createSyncLogObserver>;

	beforeEach(() => {
		jest.clearAllMocks();
		isVerboseDiagnosticsMock.mockReturnValue(false);
		rows = [];
		observer = createSyncLogObserver({
			persist: (level, message, context, terminal, toast, code) =>
				rows.push({ level, message, context, terminal, toast, code }),
			nowMs: () => 2_000,
		});
	});

	it('requires an explicit code ruling for every conformance entry', () => {
		for (const [, conformance] of Object.entries(CONFORMANCE_TABLE)) {
			expect(conformance).toHaveProperty('code');
		}
	});

	it('stamps mapped failure codes but not mapped info rows', () => {
		observer.observe(
			event({
				type: 'engine.lane.tick',
				level: 'error',
				fields: { status: 'error' },
			})
		);
		observer.observe(
			event({
				type: 'engine.lane.tick',
				fields: { status: 'ran', pushed: 1, errorCode: 'SYNC401' },
			})
		);

		expect(rows[0].code).toBe('SYNC401');
		expect(rows[1].code).toBeUndefined();
	});

	it.each([
		[503, 'SYNC131'],
		[0, 'SYNC121'],
		[403, 'AUTH201'],
		// A response IS reachability: a 409 is the clash the record events narrate
		// (SYNC221), any other 4xx is the server answering with an error (SYNC131).
		// The old catch-all labeled both "cannot be reached" (dev-next 2026-08-14).
		[409, 'SYNC221'],
		[404, 'SYNC131'],
		[422, 'SYNC131'],
	])('resolves transport status %s to %s', (status, errorCode) => {
		observer.observe(event({ type: 'transport.request', level: 'warn', fields: { status } }));

		expect(rows[0].code).toBe(errorCode);
	});

	it('stamps a statusless signal tick failure as a crashed task, not unreachable', () => {
		observer.observe(event({ type: 'signal.tick.error', level: 'error', fields: {} }));

		expect(rows[0].code).toBe('SYNC401');
	});

	it.each([
		[{ status: 401 }, 'AUTH101'],
		[{ status: 403 }, 'AUTH201'],
		[{ status: 429 }, 'SYNC141'],
		[{ status: 204, reason: 'no-document' }, 'SYNC321'],
		[{ status: 400, reason: 'pos_data_invalid' }, 'SYNC211'],
		[{ status: 409, reason: 'identity-ambiguous' }, 'SYNC201'],
		[{ status: 503 }, 'SYNC131'],
	])('resolves push.error fields %j to %s', (fields, errorCode) => {
		observer.observe(event({ type: 'push.error', level: 'error', fields }));

		expect(rows[0].code).toBe(errorCode);
	});

	it('renders a startup stall at warn per the CLIENT111 ruling', () => {
		observer.observe(event({ type: 'engine.ready-stalled', level: 'error' }));

		expect(rows[0].level).toBe('warn');
		expect(rows[0].code).toBe('CLIENT111');
	});

	it('demotes engine.guard warnings to info', () => {
		observer.observe(event({ type: 'engine.guard', level: 'warn' }));

		expect(rows[0].level).toBe('info');
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

	it('forwards an emitted operation id', () => {
		observer.observe(
			event({
				type: 'signal.cycle',
				fields: { pulls: 1, deletes: 0, operationId: 'cycle-17' },
			})
		);

		expect(rows[0].terminal?.operationId).toBe('cycle-17');
	});

	it('does not mint synthetic operation ids for operation rows', () => {
		for (let index = 0; index < 2; index += 1) {
			observer.observe(event({ type: 'engine.lane.tick', fields: { status: 'ran', pushed: 1 } }));
		}

		// A synthetic id per event would make every row unique and disable
		// repeat-collapse for the ungated non-record types. Distinguishing timed
		// units of work belongs to the logger (a row with durationMs never folds).
		expect(rows[0].terminal?.operationId).toBeUndefined();
		expect(rows[1].terminal?.operationId).toBeUndefined();
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

	it('persists catalog auto-reverts as recovered errors and requests a toast', () => {
		observer.observe(
			event({
				type: 'queue.write.auto-reverted',
				level: 'error',
				collection: 'products',
				fields: {
					recordId: 'product-9',
					mutationId: 'mutation-9',
					status: 403,
					reason: 'woocommerce_rest_cannot_edit customer@example.com',
					serverMessage: 'Sorry, you are not allowed to edit this resource. customer@example.com',
				},
			})
		);

		expect(rows[0]).toMatchObject({
			level: 'error',
			message:
				'products product-9 — change reverted to server value; see Store health (HTTP 403: woocommerce_rest_cannot_edit [redacted])',
			context: {
				type: 'queue.write.auto-reverted',
				recordId: 'product-9',
				collection: 'products',
				direction: 'push',
				mutationId: 'mutation-9',
				status: 403,
				reason: 'woocommerce_rest_cannot_edit [redacted]',
				serverMessage: 'Sorry, you are not allowed to edit this resource. [redacted]',
			},
			terminal: { operationType: 'sync.record', outcome: 'recovered' },
			toast: {
				// The server's human-readable message wins over the machine code.
				title: 'Change rejected by your store — reverted',
				description:
					'Sorry, you are not allowed to edit this resource. [redacted]. See Store health for details.',
			},
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

	// The code was SYNC101 (LOCAL_DB_WRITE_FAILED: severity error, data-at-risk,
	// contact-support) until 2026-08-19, so a routine catalogue re-check told the
	// cashier their data might be lost — 138 products at once on a dev store.
	// Nothing about an escalation is a local write failure, and no test pinned the
	// code, which is how it survived. Pin it.
	it('reports a pull escalation as a record divergence, not a local write failure', () => {
		observer.observe(
			event({
				type: 'apply.escalation',
				level: 'warn',
				collection: 'products',
				fields: { id: 88, status: 'changed', detector: 'hash-checksum' },
			})
		);

		expect(rows[0]).toMatchObject({
			level: 'warn',
			code: 'SYNC331',
			context: { direction: 'pull', collection: 'products', recordId: 88 },
		});
		expect(rows[0].code).not.toBe('SYNC101');
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

	it('persists a rebuilt coverage ledger as a recovered warning', () => {
		observer.observe(
			event({
				type: 'coverage.ledger-rebuilt',
				level: 'warn',
				fields: { reason: 'duplicate-primary-id:categories::woo-category:16' },
			})
		);

		expect(rows).toEqual([
			expect.objectContaining({
				level: 'warn',
				context: expect.objectContaining({ type: 'coverage.ledger-rebuilt' }),
				terminal: expect.objectContaining({
					operationType: 'sync.coverage',
					outcome: 'recovered',
				}),
			}),
		]);
	});

	it('persists a targeted shortfall prune as recovered sync application work', () => {
		observer.observe(
			event({
				type: 'targeted.pull.shortfall-prune',
				level: 'warn',
				collection: 'variations',
				fields: { requested: 2, received: 1, missing: 1 },
			})
		);

		expect(rows[0]).toMatchObject({
			level: 'warn',
			context: expect.objectContaining({ type: 'targeted.pull.shortfall-prune' }),
			terminal: { operationType: 'sync.apply', outcome: 'recovered' },
		});
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

	// Spec §1: "Debug never persists otherwise" — debug narration is the flight
	// recorder's job. The persist contract has no debug level, so without this guard
	// a mapped type that gained a debug emit would be relabelled as info.
	it('never persists a debug-level event for a non-forensic type', () => {
		observer.observe(
			event({ type: 'apply.pull', level: 'debug', collection: 'orders', fields: { applied: 9 } })
		);
		observer.observe(event({ type: 'signal.log', level: 'debug', message: 'noise' }));

		expect(rows).toHaveLength(0);
	});

	// #899: a 401 the refresh layer absorbed settles as a forensic debug row with
	// outcome 'recovered', chained by the arc's operationId — and the successful
	// retry (also debug, carrying the arc id) is chain evidence, not idle traffic.
	it('persists forensic debug transport rows at debug with the emitter-settled outcome', () => {
		observer.observe(
			event({
				type: 'transport.request',
				level: 'debug',
				fields: { status: 401, outcome: 'recovered', operationId: 'auth-arc-1', durationMs: 12 },
			})
		);
		observer.observe(
			event({
				type: 'transport.request',
				level: 'debug',
				fields: { status: 200, operationId: 'auth-arc-1', durationMs: 30 },
			})
		);

		expect(rows).toHaveLength(2);
		expect(rows[0].level).toBe('debug');
		expect(rows[0].terminal).toMatchObject({
			operationType: 'sync.http',
			outcome: 'recovered',
			operationId: 'auth-arc-1',
		});
		// The explicit outcome is promoted to the terminal column, not duplicated in context.
		expect(rows[0].context.outcome).toBeUndefined();
		expect(rows[1].level).toBe('debug');
		expect(rows[1].terminal).toMatchObject({ outcome: 'ok', operationId: 'auth-arc-1' });
	});

	it('drops a debug success attempt with no arc id (idle traffic stays metrics-only)', () => {
		observer.observe(
			event({ type: 'transport.request', level: 'debug', fields: { status: 200, bytes: 10 } })
		);

		expect(rows).toHaveLength(0);
	});

	it('lets an emitter-settled outcome win over level derivation on a warn row', () => {
		observer.observe(
			event({
				type: 'transport.request',
				level: 'warn',
				fields: { status: 401, outcome: 'failed', operationId: 'auth-arc-2' },
			})
		);

		expect(rows[0].terminal).toMatchObject({ outcome: 'failed', operationId: 'auth-arc-2' });
	});

	// Successful HTTP attempts are not durable rows, so their existence has to stay
	// recoverable from the cycle record that subsumes them.
	it('aggregates HTTP attempts onto the next cycle row and then resets', () => {
		observer.observe(event({ type: 'transport.request', fields: { status: 200, durationMs: 30 } }));
		observer.observe(event({ type: 'transport.request', fields: { status: 200, durationMs: 90 } }));
		observer.observe(
			event({ type: 'transport.request', level: 'warn', fields: { status: 500, durationMs: 10 } })
		);
		observer.observe(event({ type: 'signal.cycle', fields: { pulls: 2, deletes: 0 } }));

		const cycle = rows.find((row) => row.context.type === 'signal.cycle');
		expect(cycle?.context).toMatchObject({
			httpRequestsSinceLastCycle: 3,
			httpMsSinceLastCycle: 130,
			httpMaxMsSinceLastCycle: 90,
			httpErrorsSinceLastCycle: 1,
		});

		// The tally resets, so the next cycle does not double-count.
		rows.length = 0;
		observer.observe(event({ type: 'signal.cycle', fields: { pulls: 1, deletes: 0 } }));
		expect(rows[0].context.httpRequestsSinceLastCycle).toBeUndefined();
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

	it('renders an unpersisted dead letter as a record failure', () => {
		observer.observe(
			event({
				type: 'push.dead-letter-unpersisted',
				level: 'error',
				collection: 'orders',
				message: 'dead-letter verdict could not be written to the queue: database failed',
				fields: { recordId: '4711', mutationId: 'mutation-1' },
			})
		);

		expect(rows[0]).toMatchObject({
			level: 'error',
			message: 'orders 4711 — rejected change could not be saved for recovery',
			context: {
				type: 'push.dead-letter-unpersisted',
				recordId: '4711',
				direction: 'push',
				detail: 'dead-letter verdict could not be written to the queue: database failed',
			},
			terminal: { operationType: 'sync.record', outcome: 'failed' },
		});
	});

	it('renders a maintenance lane crash as a warning', () => {
		observer.observe(
			event({ type: 'maintenance.lane.error', level: 'error', message: 'lane down' })
		);

		expect(rows[0]).toMatchObject({
			level: 'warn',
			message: 'lane down',
			terminal: { operationType: 'sync.lane', outcome: 'failed' },
		});
		expect(promoteRecorderMock).toHaveBeenCalledWith('maintenance.lane.error');
	});

	it('renders a demand-path flood as a durable coded warning with its evidence in context', () => {
		observer.observe(
			event({
				type: 'demand.flood-detected',
				level: 'warn',
				message:
					'Demand-path request flood: 450 requests in 60s (threshold 300) for 3 consecutive ticks',
				fields: {
					requests: 450,
					threshold: 300,
					windowMs: 60_000,
					consecutiveTicks: 3,
					scopeId: 'scope-1',
				},
			})
		);

		expect(rows[0]).toMatchObject({
			level: 'warn',
			code: 'SYNC411',
			context: {
				type: 'demand.flood-detected',
				requests: 450,
				threshold: 300,
				windowMs: 60_000,
				consecutiveTicks: 3,
				scopeId: 'scope-1',
			},
			terminal: { operationType: 'sync.coverage', outcome: 'unknown' },
		});
	});

	it('renders single-tab write leadership as a visible lifecycle warning', () => {
		observer.observe(event({ type: 'engine.write-leader.degraded', level: 'warn' }));

		expect(rows[0]).toMatchObject({
			level: 'warn',
			terminal: { operationType: 'sync.lifecycle', outcome: 'unknown' },
		});
	});

	it('promotes barcode selector hydration failure to a visible warning', () => {
		observer.observe(
			event({
				type: 'engine.barcode-selector-hydrate-failed',
				level: 'debug',
				message: 'indexeddb unavailable',
			})
		);

		expect(rows[0]).toMatchObject({
			level: 'warn',
			terminal: { operationType: 'sync.startup', outcome: 'failed' },
		});
	});

	it('keeps internal warning narration out of cashier logs', () => {
		observer.observe(event({ type: 'browse-window.eviction-skipped', level: 'warn' }));
		observer.observe(event({ type: 'signal.log', level: 'info', message: 'narration' }));
		observer.observe(event({ type: 'queue.drain.progress', level: 'debug' }));

		expect(rows).toHaveLength(0);
	});

	it('persists invisible narration at debug under verbose diagnostics', () => {
		isVerboseDiagnosticsMock.mockReturnValue(true);
		observer.observe(
			event({
				type: 'browse-window.eviction-skipped',
				level: 'warn',
				message: 'reset won the race',
				fields: { lane: 'products' },
			})
		);

		expect(rows).toEqual([
			expect.objectContaining({
				level: 'debug',
				message: 'reset won the race',
				context: expect.objectContaining({
					type: 'browse-window.eviction-skipped',
					lane: 'products',
				}),
				terminal: { operationType: 'sync.other', outcome: 'failed' },
			}),
		]);
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

	it('persists every cadence transition and names the preset behind the numbers', () => {
		observer.observe(
			event({
				type: 'cadence.start',
				fields: { intervalMs: 60_000, tierMs: 60_000, pullBatchSize: 50 },
			})
		);
		observer.observe(
			event({
				type: 'cadence.backoff',
				fields: { signal: 'rate-limited', fromIntervalMs: 60_000, toIntervalMs: 120_000 },
			})
		);
		observer.observe(
			event({
				type: 'cadence.recovered',
				fields: { signal: 'healthy', toIntervalMs: 60_000, outcome: 'recovered' },
			})
		);

		expect(rows.map((row) => row.terminal?.operationType)).toEqual([
			'sync.cadence',
			'sync.cadence',
			'sync.cadence',
		]);
		expect(rows[0].context.preset).toBe('balanced');
		// A back-off is the app protecting the merchant's server, not a fault.
		expect(rows[1].level).toBe('info');
		expect(rows[1].terminal?.outcome).toBe('ok');
		expect(rows[2].terminal?.outcome).toBe('recovered');
	});

	it('leaves the preset unnamed when the cadence row cannot identify one', () => {
		observer.observe(event({ type: 'cadence.start', fields: { intervalMs: 60_000 } }));
		observer.observe(
			event({ type: 'cadence.start', fields: { tierMs: 45_000, pullBatchSize: 33 } })
		);

		expect(rows[0].context.preset).toBeUndefined();
		expect(rows[1].context.preset).toBe('custom');
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

describe('push.money-divergence is an advisory, not a failed transfer', () => {
	// Live regression, dev-next smoke of orders 70954-70956: a plain one-item
	// cash sale the server ACCEPTED (status completed, receipt printed the
	// server's own totals) showed in Store Health as
	//   "#70956" can't upload — orders <uuid> — server totals differ from the till
	// with a "1 stuck" pill on Pedidos, 2 sales out of 3.
	//
	// Nothing had failed. `deriveStuckRecords` takes the NEWEST decisive
	// `sync.record` row per record and reads `failed`/`rejected` as "did not
	// make it to the server". The divergence row is written AFTER the
	// `push.outcome` ok row (the push emits during the drain; the divergence
	// rides the post-drain flush), so it won the tie and marked a completed sale
	// undeliverable.
	//
	// It has to stay an error-level row a cashier can find — the money really
	// did change. It must not claim the record failed to upload.
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

	const divergence = () =>
		observer.observe(
			event({
				type: 'push.money-divergence',
				level: 'error',
				collection: 'orders',
				message: 'order 6cc42964 — the server totals differ from the POS calculation',
				fields: {
					recordId: '6cc42964-cd42-4c78-bcd6-062329ba81ea',
					mutationId: 'm-1',
					outcome: 'failed',
					mode: 'exact-6dp',
					divergentFields: 'total,total_tax',
				},
			})
		);

	it('is NOT a sync.record row, so it cannot be read as a stuck record', () => {
		divergence();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.terminal?.operationType).not.toBe('sync.record');
	});

	it('still persists at error with the record named, so the cashier can find it', () => {
		divergence();
		expect(rows[0]?.level).toBe('error');
		expect(rows[0]?.context.recordId).toBe('6cc42964-cd42-4c78-bcd6-062329ba81ea');
		expect(rows[0]?.context.type).toBe('push.money-divergence');
		expect(rows[0]?.context.divergentFields).toBe('total,total_tax');
	});

	it('does not overturn the push.outcome that said the write succeeded', () => {
		observer.observe(
			event({
				type: 'push.outcome',
				collection: 'orders',
				fields: { recordId: '6cc42964-cd42-4c78-bcd6-062329ba81ea', outcome: 'ok' },
			})
		);
		divergence();

		const recordRows = rows.filter((row) => row.terminal?.operationType === 'sync.record');
		expect(recordRows).toHaveLength(1);
		expect(recordRows[0]?.terminal?.outcome).toBe('ok');
	});
});
