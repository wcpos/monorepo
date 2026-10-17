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

	it('files a quietly settled failed request as failed, with no code', () => {
		observer.observe(
			event({ type: 'transport.request', level: 'info', fields: { status: 503, path: '/x' } })
		);
		observer.observe(event({ type: 'transport.request', level: 'info', fields: { status: 0 } }));

		expect(rows.map((row) => [row.level, row.code, row.terminal?.outcome])).toEqual([
			['info', undefined, 'failed'],
			['info', undefined, 'failed'],
		]);
	});

	it('classifies a persistent request deadline as unreachable rather than a crashed task', () => {
		observer.observe(
			event({
				type: 'engine.request.deadline',
				level: 'warn',
				fields: { lane: 'change-signal', elapsedMs: 60_000, consecutiveDeadlines: 3 },
			})
		);
		expect(rows[0]).toMatchObject({
			level: 'warn',
			code: 'SYNC121',
			terminal: { outcome: 'failed' },
		});
		expect(rows[0].message).toMatch(/deadline/i);
	});

	it('keeps a deadline the next tick retries at info until the lane has timed out 3 times', () => {
		for (const consecutiveDeadlines of [1, 2]) {
			observer.observe(
				event({
					type: 'engine.request.deadline',
					level: 'warn',
					fields: { lane: 'change-signal', elapsedMs: 60_000, consecutiveDeadlines },
				})
			);
		}
		expect(rows.map((row) => [row.level, row.code])).toEqual([
			['info', undefined],
			['info', undefined],
		]);
		expect(rows[0].terminal?.outcome).toBe('failed');
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
		// An unexpected 1xx/3xx (or an unreadable 2xx) is still an answer.
		[302, 'SYNC131'],
	])('resolves transport status %s to %s', (status, errorCode) => {
		observer.observe(event({ type: 'transport.request', level: 'warn', fields: { status } }));

		expect(rows[0].code).toBe(errorCode);
	});

	it('leaves a signal tick failed by a request to the transport row that reported it', () => {
		for (const status of [0, 401, 429, 503]) {
			observer.observe(
				event({
					type: 'signal.tick.error',
					level: 'error',
					fields: { lane: 'change-signal', status, consecutiveFailures: 5 },
				})
			);
		}

		expect(rows.map((row) => [row.level, row.code])).toEqual([
			['info', undefined],
			['info', undefined],
			['info', undefined],
			['info', undefined],
		]);
	});

	it('alarms on a local signal tick failure only once it has repeated 3 times', () => {
		for (const consecutiveFailures of [1, 2, 3]) {
			observer.observe(
				event({
					type: 'signal.tick.error',
					level: 'error',
					message: 'bulkUpsert failed',
					fields: { lane: 'change-signal', consecutiveFailures },
				})
			);
		}

		expect(rows.map((row) => [row.level, row.code])).toEqual([
			['info', undefined],
			['info', undefined],
			['warn', 'SYNC401'],
		]);
	});

	it('names a persisting 2xx poison page as a server error, not unreachability', () => {
		observer.observe(
			event({
				type: 'signal.tick.error',
				level: 'error',
				fields: { lane: 'change-signal', status: 200, consecutiveFailures: 3 },
			})
		);

		expect(rows[0]).toMatchObject({ level: 'warn', code: 'SYNC131' });
	});

	it.each([
		[{ status: 429 }, 'SYNC141'],
		[{ status: 503 }, 'SYNC131'],
		// A 2xx whose ack could not be read reached the store; it did not confirm.
		[{ status: 204, reason: 'no-document' }, 'SYNC131'],
		// No answer in time — never "rejected by your store".
		[{ status: 408 }, 'SYNC121'],
		[{ status: 425 }, 'SYNC121'],
		[{ reason: 'TypeError', phase: 'transport' }, 'SYNC121'],
	])('resolves a persisting retryable push.error %j to %s', (fields, errorCode) => {
		observer.observe(
			event({
				type: 'push.error',
				level: 'error',
				fields: { ...fields, attempt: 3, retryable: true },
			})
		);

		expect(rows[0]).toMatchObject({ level: 'warn', code: errorCode });
	});

	it('keeps a retryable push.error at info until the third failed push of the record', () => {
		for (const attempt of [1, 2]) {
			observer.observe(
				event({
					type: 'push.error',
					level: 'error',
					fields: { recordId: 'o-1', status: 503, attempt, retryable: true },
				})
			);
		}

		expect(rows.map((row) => [row.level, row.code])).toEqual([
			['info', undefined],
			['info', undefined],
		]);
		// Still a failed transfer for the stuck-records view.
		expect(rows[0].terminal?.outcome).toBe('failed');
	});

	it.each([
		// The drain holds the session; the auth layer writes the verdict.
		[{ status: 401, retryable: true }],

		// Dead-letters next: push.rejected / auto-reverted carry the verdict.
		[{ status: 403, retryable: false }],
		[{ status: 400, reason: 'pos_data_invalid', retryable: false }],
		[{ status: 409, reason: 'identity-ambiguous', retryable: false }],
	])('leaves push.error %j to the row that settles it', (fields) => {
		observer.observe(
			event({ type: 'push.error', level: 'error', fields: { ...fields, attempt: 5 } })
		);

		expect(rows[0]).toMatchObject({ level: 'info', code: undefined });
	});

	it('warns SYNC131 once a 428 has looped for 3 pushes (the revision refresh keeps failing)', () => {
		// The drain refreshes the revision and re-pushes; only a refresh that keeps
		// throwing backs the row off and retries with nothing else reporting it.
		for (const attempt of [1, 2, 3]) {
			observer.observe(
				event({
					type: 'push.error',
					level: 'warn',
					fields: { status: 428, reason: 'precondition-required', retryable: false, attempt },
				})
			);
		}

		expect(rows.map((row) => [row.level, row.code])).toEqual([
			['info', undefined],
			['info', undefined],
			['warn', 'SYNC131'],
		]);
	});

	it('keeps the first startup stall at info and warns from the repeat per the CLIENT111 ruling', () => {
		observer.observe(
			event({ type: 'engine.ready-stalled', level: 'error', fields: { stalls: 1 } })
		);
		observer.observe(
			event({ type: 'engine.ready-stalled', level: 'error', fields: { stalls: 2 } })
		);

		expect(rows.map((row) => [row.level, row.code])).toEqual([
			['info', undefined],
			['warn', 'CLIENT111'],
		]);
	});

	it('leaves a refused write session to the auth layer row', () => {
		observer.observe(
			event({
				type: 'queue.write.session-refused',
				level: 'error',
				message: 'store refused the session',
			})
		);

		expect(rows[0].level).toBe('info');
		expect(rows[0].code).toBeUndefined();
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

	it('persists cursor anomalies as unknown info rows with cursor context', () => {
		observer.observe(
			event({
				type: 'signal.cursor',
				level: 'warn',
				message: 'change-signal: cursor reset to zero',
				fields: { reason: 'reset', from: 5, to: 0 },
			})
		);

		// A deliberate rebaseline the same tick reconciles — no SYNC301 instruction.
		expect(rows).toEqual([
			expect.objectContaining({
				level: 'info',
				code: undefined,
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

		// Error: the dead-letter verdict, at the severity of the code it carries.
		expect(rows[0]).toMatchObject({
			level: 'error',
			code: 'SYNC211',
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

	it('persists catalog auto-reverts as recovered SYNC202 warnings and requests a toast', () => {
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
			level: 'warn',
			code: 'SYNC202',
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

	it('keeps SYNC221 for the parked clash, not the first 409 an order re-pushes past', () => {
		observer.observe(
			event({
				type: 'push.conflict',
				level: 'warn',
				collection: 'orders',
				fields: { recordId: 'order-9', mutationId: 'mutation-9' },
			})
		);
		observer.observe(
			event({
				type: 'queue.write.conflict-transition',
				level: 'warn',
				collection: 'orders',
				fields: { recordId: 'order-9', mutationId: 'mutation-9' },
			})
		);

		expect(rows.map((row) => [row.context.type, row.level, row.code])).toEqual([
			['push.conflict', 'info', undefined],
			['queue.write.conflict-transition', 'warn', 'SYNC221'],
		]);
	});

	it('names the server fields overwritten by a recovered conflict', () => {
		observer.observe(
			event({
				type: 'queue.write.conflict-overwrote-server',
				level: 'warn',
				collection: 'orders',
				fields: {
					recordId: 'order-9',
					mutationId: 'mutation-9',
					baseRevision: 'sha256:store',
					overwrittenFields: ['line_items[12]', 'status'],
					overwrittenCount: 2,
				},
			})
		);

		// SYNC222: the order saved, but someone may need to redo the store's edit.
		expect(rows[0]).toMatchObject({
			level: 'warn',
			code: 'SYNC222',
			message: 'orders order-9 — overwrote 2 store fields: line_items[12], status',
			context: {
				type: 'queue.write.conflict-overwrote-server',
				recordId: 'order-9',
				direction: 'push',
				overwrittenFields: ['line_items[12]', 'status'],
				overwrittenCount: 2,
			},
			terminal: { operationType: 'sync.record', outcome: 'recovered' },
		});
		expect(rows[0].toast).toBeUndefined();
	});

	it('marks a capped overwrite field list as partial', () => {
		observer.observe(
			event({
				type: 'queue.write.conflict-overwrote-server',
				level: 'warn',
				collection: 'orders',
				fields: {
					recordId: 'order-9',
					mutationId: 'mutation-9',
					baseRevision: 'sha256:store',
					overwrittenFields: ['billing.email', 'status'],
					overwrittenCount: 3,
				},
			})
		);

		expect(rows[0].message).toBe(
			'orders order-9 — overwrote 3 store fields (showing 2): billing.email, status'
		);
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

	// Regression: the did-work gate must never suppress a warn/error event. An
	// emitter can raise the level on a signal its counters don't carry, so gating
	// on those counters would silently drop the evidence this observer preserves.
	it('never lets the did-work gate drop a failure-level event', () => {
		observer.observe(
			event({
				type: 'queue.write.drain',
				level: 'error',
				fields: { pushed: 0, conflicts: 0, failed: 0, rejected: 0 },
			})
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			level: 'error',
			terminal: { operationType: 'sync.queue', outcome: 'failed' },
		});
	});

	it('keeps scheduler drain summaries, lost work included, as uncoded info rows', () => {
		observer.observe(
			event({
				type: 'queue.scheduler.drain',
				level: 'warn',
				fields: { scanned: 3, succeeded: 0, failed: 0, completionLost: 1 },
			})
		);
		observer.observe(
			event({ type: 'queue.scheduler.drain', level: 'warn', fields: { succeeded: 0, failed: 2 } })
		);

		expect(rows.map((row) => [row.level, row.code, row.terminal?.outcome])).toEqual([
			['info', undefined, 'ok'],
			['info', undefined, 'failed'],
		]);
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

	it('records a cleared pull escalation as recovered with the same record key', () => {
		observer.observe(
			event({
				type: 'apply.escalation-cleared',
				level: 'info',
				collection: 'products',
				fields: { id: 88, detector: 'hash-checksum' },
			})
		);

		expect(rows[0]).toMatchObject({
			level: 'info',
			context: { direction: 'pull', collection: 'products', recordId: 88 },
			terminal: { operationType: 'sync.record', outcome: 'recovered' },
		});
		expect(rows[0].code).toBeUndefined();
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

	it('persists a rebuilt coverage ledger as a recovered info event', () => {
		observer.observe(
			event({
				type: 'coverage.ledger-rebuilt',
				level: 'warn',
				fields: { reason: 'duplicate-primary-id:categories::woo-category:16' },
			})
		);

		expect(rows).toEqual([
			expect.objectContaining({
				level: 'info',
				context: expect.objectContaining({ type: 'coverage.ledger-rebuilt' }),
				terminal: expect.objectContaining({
					operationType: 'sync.coverage',
					outcome: 'recovered',
				}),
			}),
		]);
	});

	it('persists a re-attached coverage ledger as a recovered info event', () => {
		observer.observe(
			event({
				type: 'coverage.ledger-reattached',
				level: 'info',
				fields: { reason: 'collection-closed:coverageRecords' },
			})
		);

		expect(rows).toEqual([
			expect.objectContaining({
				level: 'info',
				context: expect.objectContaining({ type: 'coverage.ledger-reattached' }),
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
			level: 'info',
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

	it('renders a repeating maintenance lane crash as a SYNC401 warning', () => {
		for (const consecutiveFailures of [1, 3]) {
			observer.observe(
				event({
					type: 'maintenance.lane.error',
					level: 'error',
					message: 'lane down',
					fields: { lane: 'product-trickle', consecutiveFailures },
				})
			);
		}

		expect(rows.map((row) => [row.level, row.code])).toEqual([
			['info', undefined],
			['warn', 'SYNC401'],
		]);
		expect(rows[1]).toMatchObject({
			message: 'lane down',
			terminal: { operationType: 'sync.lane', outcome: 'failed' },
		});
		expect(promoteRecorderMock).toHaveBeenCalledWith('maintenance.lane.error');
	});

	it('leaves a maintenance lane failed by a request to the transport row', () => {
		observer.observe(
			event({
				type: 'maintenance.lane.error',
				level: 'error',
				message: '/products trickle pull failed: HTTP 503',
				fields: { lane: 'product-trickle', status: 503, consecutiveFailures: 4 },
			})
		);

		expect(rows[0]).toMatchObject({ level: 'info', code: undefined });
	});

	it('leaves a requirement failed by a request to the transport row, and warns on a local one', () => {
		observer.observe(
			event({ type: 'coverage.require.error', level: 'error', fields: { status: 400 } })
		);
		observer.observe(event({ type: 'coverage.require.error', level: 'error', fields: {} }));

		expect(rows.map((row) => [row.level, row.code])).toEqual([
			['info', undefined],
			['warn', 'SYNC401'],
		]);
	});

	it('tells the merchant to update the plugin when the store rejects the customer sort', () => {
		observer.observe(event({ type: 'customer.browse-window.sort-rejected', level: 'warn' }));

		expect(rows[0]).toMatchObject({ level: 'warn', code: 'AUTH331' });
	});

	it.each([
		['push.aborted', 'warn'],
		['queue.write.reschedule-failed', 'warn'],
		['product.browse-window.approximate', 'warn'],
		['product.browse-window.brand-filter-ignored', 'warn'],
		['coverage.require.stalled', 'warn'],
		['browse-window.backstop-reached', 'warn'],
		['engine.reset-needs-confirmation', 'warn'],
		['apply.barcode-rederive', 'warn'],
	] as const)('keeps self-settling %s as an uncoded info row', (type, level) => {
		observer.observe(event({ type, level, fields: { recordId: 'r-1' } }));

		expect(rows[0]).toMatchObject({ level: 'info', code: undefined });
	});

	it('keeps a failed existence-audit cursor write as a failed info row', () => {
		observer.observe(
			event({
				type: 'coverage.existence-reconcile',
				level: 'warn',
				fields: { pruned: 0, missing: 0, changed: 0, outcome: 'failed' },
			})
		);

		expect(rows[0]).toMatchObject({
			level: 'info',
			code: undefined,
			terminal: { outcome: 'failed' },
		});
	});

	it.each([
		['queue.write.reschedule-failed', 'consecutiveFailures', 'SYNC101', {}],
		['queue.write.ack-failed', 'consecutiveFailures', 'SYNC101', {}],
		['coverage.require.stalled', 'consecutiveStalls', 'SYNC181', {}],
		['coverage.existence-reconcile', 'consecutiveFailures', 'SYNC101', { outcome: 'failed' }],
	] as const)(
		'keeps %s at info until its %s streak persists, then warns %s',
		(type, field, errorCode, extra) => {
			for (const count of [1, 3]) {
				observer.observe(
					event({
						type,
						level: 'warn',
						fields: { recordId: 'r-1', pruned: 0, ...extra, [field]: count },
					})
				);
			}

			expect(rows.map((row) => [row.level, row.code])).toEqual([
				['info', undefined],
				['warn', errorCode],
			]);
		}
	);

	it('files an ack that failed after its push landed as unknown, never a stuck upload', () => {
		observer.observe(
			event({
				type: 'queue.write.ack-failed',
				level: 'warn',
				fields: { recordId: 'o-1', consecutiveFailures: 1 },
			})
		);

		expect(rows[0].terminal?.outcome).toBe('unknown');
	});

	it('warns SYNC401 on scheduler task failures no other row reported, once they persist', () => {
		for (const consecutiveUnreportedFailures of [1, 3]) {
			observer.observe(
				event({
					type: 'queue.scheduler.drain',
					level: 'warn',
					fields: {
						succeeded: 0,
						failed: 2,
						failedUnreported: 1,
						consecutiveUnreportedFailures,
					},
				})
			);
		}

		expect(rows.map((row) => [row.level, row.code])).toEqual([
			['info', undefined],
			['warn', 'SYNC401'],
		]);
	});

	it.each([300, 302, 101])(
		'treats an unexpected %s as a request the transport already reported',
		(status) => {
			observer.observe(
				event({
					type: 'signal.tick.error',
					level: 'error',
					fields: { lane: 'change-signal', status, consecutiveFailures: 5 },
				})
			);
			observer.observe(event({ type: 'transport.request', level: 'info', fields: { status } }));

			expect(rows.map((row) => [row.level, row.code, row.terminal?.outcome])).toEqual([
				['info', undefined, 'failed'],
				['info', undefined, 'failed'],
			]);
		}
	);

	it('streak-gates a write drain crash and keeps the claim-release failure quiet', () => {
		for (const consecutiveFailures of [1, 3]) {
			observer.observe(
				event({ type: 'queue.write.tick.error', level: 'error', fields: { consecutiveFailures } })
			);
		}
		// Conflict resolution's claim release: no streak, self-heals at the lease.
		observer.observe(
			event({ type: 'queue.write.tick.error', level: 'warn', fields: { mutationId: 'm-1' } })
		);

		expect(rows.map((row) => [row.level, row.code])).toEqual([
			['info', undefined],
			['warn', 'SYNC401'],
			['info', undefined],
		]);
	});

	it.each([
		[{ status: 403 }, 'AUTH201'],
		[{ status: 400, reason: 'pos_data_invalid' }, 'SYNC211'],
		[{ status: 400, reason: 'rest_invalid_param' }, 'SYNC211'],
		[{ status: 400, reason: 'woocommerce_rest_invalid_id' }, 'SYNC201'],
	])('maps push.rejected %j to %s', (fields, errorCode) => {
		observer.observe(
			event({ type: 'push.rejected', level: 'warn', fields: { recordId: 'o-1', ...fields } })
		);

		expect(rows[0]).toMatchObject({ level: 'error', code: errorCode });
	});

	it('parks needs-revision under the conflict code, not "fix the named field"', () => {
		observer.observe(
			event({ type: 'queue.write.needs-revision', level: 'warn', fields: { recordId: 'o-1' } })
		);

		expect(rows[0]).toMatchObject({ level: 'warn', code: 'SYNC221' });
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

	it('records degraded write leadership as a visible info row, not CLIENT121', () => {
		observer.observe(event({ type: 'engine.write-leader.degraded', level: 'warn' }));

		expect(rows[0]).toMatchObject({
			level: 'info',
			code: undefined,
			terminal: { operationType: 'sync.lifecycle', outcome: 'unknown' },
		});
	});

	it('records barcode selector hydration failure as a visible info row', () => {
		observer.observe(
			event({
				type: 'engine.barcode-selector-hydrate-failed',
				level: 'debug',
				message: 'indexeddb unavailable',
			})
		);

		expect(rows[0]).toMatchObject({
			level: 'info',
			code: undefined,
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

	const divergence = (roundingClass: 'sub-cent' | 'cent' | 'material' = 'cent') =>
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
					roundingClass,
					divergentFields: 'total,total_tax',
				},
			})
		);

	it('keeps a difference under one minor unit as an info row with no stop instruction', () => {
		const persisted: { level: string; code?: ErrorCode }[] = [];
		createSyncLogObserver({
			persist: (level, _message, _context, _terminal, _toast, code) =>
				persisted.push({ level, code }),
		}).observe(
			event({
				type: 'push.money-divergence',
				level: 'error',
				collection: 'orders',
				fields: { recordId: 'o-1', outcome: 'failed', roundingClass: 'sub-cent' },
			})
		);

		expect(persisted).toEqual([{ level: 'info', code: undefined }]);
	});

	it.each(['cent', 'material'] as const)(
		'keeps CHECKOUT401 at error for a %s divergence',
		(cls) => {
			const persisted: { level: string; code?: ErrorCode }[] = [];
			createSyncLogObserver({
				persist: (level, _message, _context, _terminal, _toast, code) =>
					persisted.push({ level, code }),
			}).observe(
				event({
					type: 'push.money-divergence',
					level: 'error',
					collection: 'orders',
					fields: { recordId: 'o-1', outcome: 'failed', roundingClass: cls },
				})
			);

			expect(persisted).toEqual([{ level: 'error', code: 'CHECKOUT401' }]);
		}
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
