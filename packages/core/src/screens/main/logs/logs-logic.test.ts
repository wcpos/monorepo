import {
	buildDebugInfo,
	buildLogEntryReport,
	chainMarkedIds,
	deriveClockSkew,
	deriveStuckRecords,
	displayCategory,
	displayKind,
	formatCadence,
	formatDurationMs,
	formatSkewMagnitude,
	type LogRow,
	presetFilters,
	rowDetailData,
	shouldExtendLedger,
	startOfLocalDay,
} from './logs-logic';

const row = (overrides: Partial<LogRow>): LogRow => ({
	logId: overrides.logId ?? 'log-1',
	timestamp: overrides.timestamp ?? 1_000,
	...overrides,
});

describe('displayCategory', () => {
	it('strips the universal wcpos prefix', () => {
		expect(displayCategory('wcpos.sync.engine')).toBe('sync.engine');
	});

	it('leaves foreign categories untouched', () => {
		expect(displayCategory('db.audit')).toBe('db.audit');
		expect(displayCategory(undefined)).toBe('');
	});
});

describe('displayKind', () => {
	it('lets severity win over everything', () => {
		expect(displayKind({ level: 'error', actor: { name: 'Paul' } })).toBe('error');
		expect(displayKind({ level: 'warn', category: 'wcpos.sync.engine' })).toBe('warn');
	});

	it('reads actor rows as actions', () => {
		expect(displayKind({ level: 'info', actor: { id: '1', name: 'Paul' } })).toBe('action');
	});

	it('reads the sync domain as sync', () => {
		expect(displayKind({ level: 'info', category: 'wcpos.sync.engine' })).toBe('sync');
		expect(displayKind({ level: 'info', category: 'wcpos.syncopation' })).toBe('info');
	});

	it('reads a sync-domain diagnostic row as debug, not as sync', () => {
		// Verbose diagnostics exists to make the forensic rows findable; painting
		// them with the same blue 'sync' pill as the running feed hid them among
		// the rows already there (Paul, 2026-08-24). An ATTRIBUTED row keeps its
		// action framing — who did it outranks how loudly it was written.
		expect(displayKind({ level: 'debug', category: 'wcpos.sync.engine' })).toBe('debug');
		expect(
			displayKind({ level: 'debug', category: 'wcpos.sync.engine', actor: { name: 'Paul' } })
		).toBe('action');
	});

	it('falls back to the record level', () => {
		expect(displayKind({ level: 'debug' })).toBe('debug');
		expect(displayKind({ level: 'info' })).toBe('info');
		expect(displayKind({})).toBe('info');
	});
});

describe('presetFilters', () => {
	it('excludes debug unless verbose diagnostics is on', () => {
		expect(presetFilters('all', false)).toEqual({
			level: ['info', 'warn', 'error'],
		});
		expect(presetFilters('all', true)).toEqual({
			level: ['debug', 'info', 'warn', 'error'],
		});
	});

	it('narrows errors to error level only, matching the stat header count', () => {
		expect(presetFilters('errors', true)).toEqual({ level: ['error'] });
	});

	it('scopes sync to the category prefix and actions to actor rows', () => {
		expect(presetFilters('sync', false)).toEqual({
			level: ['info', 'warn', 'error'],
			category_prefix: 'wcpos.sync',
		});
		expect(presetFilters('actions', false)).toEqual({
			level: ['info', 'warn', 'error'],
			has_actor: true,
		});
	});
});

describe('chainMarkedIds', () => {
	it('marks runs of two or more consecutive rows sharing an operationId', () => {
		const rows = [
			{ logId: 'a', operationId: 'op1' },
			{ logId: 'b', operationId: 'op1' },
			{ logId: 'c', operationId: undefined },
			{ logId: 'd', operationId: 'op2' },
			{ logId: 'e', operationId: 'op3' },
			{ logId: 'f', operationId: 'op3' },
			{ logId: 'g', operationId: 'op3' },
		];
		expect([...chainMarkedIds(rows)].sort()).toEqual(['a', 'b', 'e', 'f', 'g']);
	});

	it('never chains rows without an operationId, even when adjacent', () => {
		const rows = [
			{ logId: 'a', operationId: undefined },
			{ logId: 'b', operationId: undefined },
		];
		expect(chainMarkedIds(rows).size).toBe(0);
	});
});

describe('deriveClockSkew', () => {
	const NOW = 1_000_000_000;

	it('returns the most recently measured skew warning', () => {
		const rows = [
			row({
				logId: 'a',
				timestamp: NOW - 5_000,
				context: { skewSeconds: 120 },
			}),
			row({
				logId: 'b',
				timestamp: NOW - 50_000,
				context: { skewSeconds: -300 },
			}),
		];
		expect(deriveClockSkew(rows, NOW)).toEqual({
			skewSeconds: 120,
			observedAt: NOW - 5_000,
			lastSeen: NOW - 5_000,
		});
	});

	it('never lets a collapsed repeat lend its fresh lastSeen to a stale skew value', () => {
		// Repeat-collapse moves only count/lastSeen — the context still carries the
		// FIRST check's value, so a later check that found the opposite sign must
		// not be reported through this row's refreshed lastSeen.
		const rows = [
			row({
				logId: 'a',
				timestamp: NOW - 5_000,
				lastSeen: NOW - 1_000,
				count: 2,
				context: { skewSeconds: 300 },
			}),
			row({
				logId: 'b',
				timestamp: NOW - 2_000,
				context: { skewSeconds: -300 },
			}),
		];
		// The standalone row measured later, so its value is the one shown.
		expect(deriveClockSkew(rows, NOW)).toEqual({
			skewSeconds: -300,
			observedAt: NOW - 2_000,
			lastSeen: NOW - 2_000,
		});
	});

	it('ages a collapsed row out 24 hours after its value was measured, not after its last sighting', () => {
		const dayMs = 24 * 60 * 60 * 1000;
		const rows = [
			row({
				logId: 'a',
				timestamp: NOW - dayMs - 1,
				lastSeen: NOW - 1_000,
				count: 5,
				context: { skewSeconds: 300 },
			}),
		];
		expect(deriveClockSkew(rows, NOW)).toBeNull();
	});

	it('ignores warn rows without a numeric skewSeconds', () => {
		const rows = [
			row({
				logId: 'a',
				timestamp: NOW,
				context: { type: 'engine.scope-switch' },
			}),
			row({ logId: 'b', timestamp: NOW, context: { skewSeconds: 'oops' } }),
			row({ logId: 'c', timestamp: NOW, context: { skewSeconds: 0 } }),
		];
		expect(deriveClockSkew(rows, NOW)).toBeNull();
	});

	it('ages a warning out of the panel after 24 hours', () => {
		const dayMs = 24 * 60 * 60 * 1000;
		const stale = [
			row({
				logId: 'a',
				timestamp: NOW - dayMs - 1,
				context: { skewSeconds: 90 },
			}),
		];
		expect(deriveClockSkew(stale, NOW)).toBeNull();
		const fresh = [
			row({
				logId: 'a',
				timestamp: NOW - dayMs + 1_000,
				context: { skewSeconds: 90 },
			}),
		];
		expect(deriveClockSkew(fresh, NOW)).toEqual({
			skewSeconds: 90,
			observedAt: NOW - dayMs + 1_000,
			lastSeen: NOW - dayMs + 1_000,
		});
	});

	it('drops future-dated rows left behind by a backward clock correction', () => {
		const dayMs = 24 * 60 * 60 * 1000;
		// Written while the device was two days fast; the clock has since been fixed.
		const rows = [
			row({
				logId: 'a',
				timestamp: NOW + 2 * dayMs,
				context: { skewSeconds: 300 },
			}),
		];
		expect(deriveClockSkew(rows, NOW)).toBeNull();
	});

	it('never lets a future-dated row mask a current warning', () => {
		const dayMs = 24 * 60 * 60 * 1000;
		const rows = [
			row({
				logId: 'a',
				timestamp: NOW + 2 * dayMs,
				context: { skewSeconds: 300 },
			}),
			row({
				logId: 'b',
				timestamp: NOW - 1_000,
				context: { skewSeconds: -120 },
			}),
		];
		expect(deriveClockSkew(rows, NOW)).toEqual({
			skewSeconds: -120,
			observedAt: NOW - 1_000,
			lastSeen: NOW - 1_000,
		});
	});

	it('tolerates a row a few seconds ahead of now', () => {
		const rows = [
			row({
				logId: 'a',
				timestamp: NOW + 5_000,
				context: { skewSeconds: 300 },
			}),
		];
		expect(deriveClockSkew(rows, NOW)).toEqual({
			skewSeconds: 300,
			observedAt: NOW + 5_000,
			lastSeen: NOW + 5_000,
		});
	});

	it('returns null for no rows', () => {
		expect(deriveClockSkew([], NOW)).toBeNull();
	});
});

describe('formatSkewMagnitude', () => {
	it('reads magnitudes in the unit a merchant would say out loud', () => {
		expect(formatSkewMagnitude(45)).toBe('45 s');
		expect(formatSkewMagnitude(-300)).toBe('5 min');
		expect(formatSkewMagnitude(3_540)).toBe('59 min');
		expect(formatSkewMagnitude(2 * 3_600)).toBe('2.0 h');
		expect(formatSkewMagnitude(-5 * 3_600)).toBe('5.0 h');
	});
});

describe('formatDurationMs', () => {
	it('formats across unit boundaries', () => {
		expect(formatDurationMs(210)).toBe('210 ms');
		expect(formatDurationMs(4_100)).toBe('4.1 s');
		expect(formatDurationMs(125_000)).toBe('2m 05s');
	});

	it('rejects garbage', () => {
		expect(formatDurationMs(undefined)).toBeNull();
		expect(formatDurationMs(-5)).toBeNull();
		expect(formatDurationMs(Number.NaN)).toBeNull();
	});
});

describe('formatCadence', () => {
	it('reads short cadences in seconds and long ones in minutes', () => {
		expect(formatCadence(10_000)).toEqual({ value: 10, unit: 's' });
		expect(formatCadence(120_000)).toEqual({ value: 2, unit: 'min' });
	});

	it('returns null when the engine has no usable schedule', () => {
		expect(formatCadence(0)).toBeNull();
		expect(formatCadence(Number.NaN)).toBeNull();
	});
});

describe('startOfLocalDay', () => {
	it('is a local midnight at or before now', () => {
		const now = Date.now();
		const start = startOfLocalDay(now);
		expect(start).toBeLessThanOrEqual(now);
		expect(new Date(start).getHours()).toBe(0);
		expect(new Date(start).getMinutes()).toBe(0);
	});
});

describe('deriveStuckRecords', () => {
	const recordRow = (
		logId: string,
		timestamp: number,
		outcome: string,
		context: Record<string, unknown>
	): LogRow =>
		row({
			logId,
			timestamp,
			outcome,
			operationType: 'sync.record',
			context,
			level: 'error',
		});

	// Live regression, dev-next orders 70954-70956: a completed sale the server
	// ACCEPTED was reported as "can't upload — server totals differ from the
	// till" with a stuck pill on Orders, 2 sales out of 3. The R1 money-divergence
	// row is written AFTER the push.outcome ok row, so as a `sync.record` failure
	// it won this derivation's newest-wins tie and overturned a successful write.
	// It is now `sync.money`; this pins that the derivation ignores it.
	it('does not let a money-divergence advisory overturn a successful write', () => {
		const rows = [
			row({
				logId: 'divergence',
				timestamp: 400,
				outcome: 'failed',
				operationType: 'sync.money',
				level: 'error',
				context: {
					recordId: '6cc42964',
					collection: 'orders',
					type: 'push.money-divergence',
					reason: 'server totals differ from the till',
				},
			}),
			recordRow('push-ok', 300, 'ok', {
				recordId: '6cc42964',
				collection: 'orders',
			}),
		];

		expect(deriveStuckRecords(rows)).toEqual([]);
	});

	it('still reports a record whose transfer really did fail', () => {
		const rows = [
			recordRow('push-failed', 400, 'failed', {
				recordId: '6cc42964',
				collection: 'orders',
				reason: 'rest_invalid_param',
			}),
			recordRow('push-ok', 300, 'ok', {
				recordId: '6cc42964',
				collection: 'orders',
			}),
		];

		expect(deriveStuckRecords(rows).map((entry) => entry.recordId)).toEqual(['6cc42964']);
	});

	it('rules stuck from the latest decisive outcome per record', () => {
		const rows = [
			recordRow('newest', 300, 'failed', {
				recordId: 812,
				collection: 'products',
				reason: 'invalid tax class',
			}),
			recordRow('older-ok', 200, 'ok', {
				recordId: 812,
				collection: 'products',
			}),
			recordRow('other-ok', 250, 'ok', { recordId: 5, collection: 'orders' }),
		];
		const stuck = deriveStuckRecords(rows);
		expect(stuck).toHaveLength(1);
		expect(stuck[0]).toMatchObject({
			collection: 'products',
			recordId: '812',
			reason: 'invalid tax class',
		});
	});

	it('clears a record whose latest decisive row is ok', () => {
		const rows = [
			recordRow('ok-now', 300, 'ok', { recordId: 812, collection: 'products' }),
			recordRow('failed-before', 200, 'failed', {
				recordId: 812,
				collection: 'products',
			}),
		];
		expect(deriveStuckRecords(rows)).toHaveLength(0);
	});

	it('clears a rejected record whose latest row says it recovered', () => {
		const rows = [
			recordRow('auto-reverted', 300, 'recovered', {
				recordId: 812,
				collection: 'products',
				type: 'queue.write.auto-reverted',
			}),
			recordRow('rejected-before', 200, 'rejected', {
				recordId: 812,
				collection: 'products',
				type: 'push.rejected',
			}),
		];
		expect(deriveStuckRecords(rows)).toHaveLength(0);
	});

	it('clears a pull escalation after a newer recovered row for the same record', () => {
		const rows = [
			recordRow('cleared', 300, 'recovered', {
				recordId: 812,
				collection: 'products',
				type: 'apply.escalation-cleared',
				direction: 'pull',
			}),
			recordRow('escalated', 200, 'failed', {
				recordId: 812,
				collection: 'products',
				type: 'apply.escalation',
				direction: 'pull',
			}),
		];

		expect(deriveStuckRecords(rows)).toEqual([]);
	});

	it('clears a rejected record once a requeue-rebuilt row says it is back in flight', () => {
		const rows = [
			recordRow('requeued', 300, 'recovered', {
				recordId: 813,
				collection: 'products',
				type: 'queue.write.requeue-rebuilt',
			}),
			recordRow('rejected-before', 200, 'rejected', {
				recordId: 813,
				collection: 'products',
				type: 'push.rejected',
			}),
		];
		expect(deriveStuckRecords(rows)).toHaveLength(0);
	});

	it('re-marks a record stuck when a fresh failure lands after a recovered row', () => {
		const rows = [
			recordRow('rejected-again', 400, 'rejected', {
				recordId: 814,
				collection: 'products',
				type: 'push.rejected',
			}),
			recordRow('requeued', 300, 'recovered', {
				recordId: 814,
				collection: 'products',
				type: 'queue.write.requeue-rebuilt',
			}),
			recordRow('rejected-before', 200, 'rejected', {
				recordId: 814,
				collection: 'products',
				type: 'push.rejected',
			}),
		];
		expect(deriveStuckRecords(rows)).toHaveLength(1);
	});

	it('skips cancelled/unknown rows so an older decisive row can rule', () => {
		const rows = [
			recordRow('aborted', 300, 'cancelled', {
				recordId: 9,
				collection: 'products',
			}),
			recordRow('rejected', 200, 'rejected', {
				recordId: 9,
				collection: 'products',
				reason: 'no',
			}),
		];
		const stuck = deriveStuckRecords(rows);
		expect(stuck).toHaveLength(1);
		expect(stuck[0].reason).toBe('no');
	});

	it('ignores rows it cannot attribute to a record', () => {
		const rows = [recordRow('anon', 300, 'failed', { collection: 'products' })];
		expect(deriveStuckRecords(rows)).toHaveLength(0);
	});

	it('carries repeat-collapse counts as attempts and sorts newest first', () => {
		const rows = [
			recordRow('a', 100, 'failed', {
				recordId: 1,
				collection: 'products',
				reason: 'x',
			}),
			recordRow('b', 300, 'failed', {
				recordId: 2,
				collection: 'orders',
				reason: 'y',
			}),
		].map((r, index) => ({ ...r, count: index + 2, lastSeen: r.timestamp }));
		const stuck = deriveStuckRecords(rows.sort((a, b) => b.timestamp - a.timestamp));
		expect(stuck.map((s) => s.recordId)).toEqual(['2', '1']);
		expect(stuck[0].attempts).toBeGreaterThan(1);
	});

	it('retains the repair status for status-aware recovery guidance', () => {
		const [stuck] = deriveStuckRecords([
			recordRow('deleted', 300, 'failed', {
				recordId: 812,
				collection: 'products',
				type: 'apply.escalation',
				direction: 'pull',
				status: 'deleted',
			}),
		]);

		expect(stuck).toMatchObject({ status: 'deleted' });
	});

	it.each([
		['push.error', 'push', true],
		['push.in_progress', 'push', true],
		['queue.write.reschedule-failed', 'push', true],
		['push.conflict', 'push', false],
		['push.rejected', 'push', false],
		['apply.escalation', 'pull', false],
	] as const)('retains %s state and marks its retryability', (eventType, direction, retryable) => {
		const [stuck] = deriveStuckRecords([
			recordRow('record', 300, 'failed', {
				recordId: 812,
				collection: 'products',
				type: eventType,
				direction,
			}),
		]);

		expect(stuck).toMatchObject({ eventType, direction, retryable });
	});
});

describe('rowDetailData', () => {
	it('assembles correlation values from terminal fields and context', () => {
		const detail = rowDetailData(
			row({
				operationId: 'op_9d21',
				operationType: 'sync.record',
				requestId: 'c41a88',
				durationMs: 500,
				count: 3,
				firstSeen: 1_000,
				lastSeen: 2_000,
				context: {
					status: 400,
					serverCode: 'woocommerce_rest_invalid_tax_class',
				},
			})
		);
		expect(detail.operation).toBe('op_9d21 · sync.record');
		expect(detail.request).toBe('c41a88 · 400 · 500 ms');
		expect(detail.serverCode).toBe('woocommerce_rest_invalid_tax_class');
		expect(detail.attempts).toEqual({
			count: 3,
			firstSeen: 1_000,
			lastSeen: 2_000,
		});
	});

	it('falls back to the context errorCode and omits empty sections', () => {
		const detail = rowDetailData(row({ context: { errorCode: 'CLIENT999' } }));
		expect(detail.serverCode).toBe('CLIENT999');
		expect(detail.operation).toBeUndefined();
		expect(detail.request).toBeUndefined();
		expect(detail.attempts).toBeUndefined();
	});

	it('does not repeat the row’s own registry code as a server code', () => {
		const detail = rowDetailData(row({ code: 'PRODUCT301', context: { errorCode: 'PRODUCT301' } }));
		expect(detail.serverCode).toBeUndefined();
	});
});

describe('buildDebugInfo', () => {
	it('produces a self-contained plain-text summary', () => {
		const text = buildDebugInfo({
			generatedAt: '2026-07-31T00:00:00.000Z',
			appVersion: '1.10.0',
			platform: 'electron',
			platformVersion: '42.0.0',
			wpVersion: '6.8.2',
			wcVersion: '10.1.0',
			wcposVersion: '1.9.0',
			wcposProVersion: '1.9.0',
			connectivity: 'online',
			eventsToday: 187,
			errorsToday: 2,
			changesWaiting: 0,
			stuckRecords: [
				{
					key: 'products:812',
					collection: 'products',
					recordId: '812',
					reason: 'invalid tax class',
					lastSeen: 0,
					attempts: 3,
					eventType: 'push.error',
					direction: 'push',
					retryable: true,
				},
			],
			verboseDiagnostics: false,
			lastCheck: { atMs: 0, status: 'ok' },
			recentErrors: [
				row({
					timestamp: 0,
					code: 'SYNC132',
					category: 'wcpos.sync.engine',
					message: 'push failed',
					count: 3,
					context: { type: 'push.error' },
				}),
			],
		});
		expect(text).toContain(
			'App version: 1.10.0\nPlatform: electron (42.0.0)\nWordPress: 6.8.2\nWooCommerce: 10.1.0\nWCPOS: 1.9.0\nWCPOS Pro: 1.9.0'
		);
		expect(text).toContain('Errors today: 2');
		expect(text).toContain('products/812: invalid tax class (×3)');
		// The raw event code is exported alongside the message: support greps it,
		// and the on-screen title is translated per till (#912).
		expect(text).toContain('SYNC132 | sync.engine | push.error | push failed (×3)');
		expect(text).toContain('1970-01-01T00:00:00.000Z (ok)');
	});

	it('stays readable with nothing to report', () => {
		const text = buildDebugInfo({
			generatedAt: 'now',
			wpVersion: '',
			wcVersion: '',
			wcposVersion: '',
			wcposProVersion: '',
			connectivity: 'offline',
			eventsToday: 0,
			errorsToday: 0,
			changesWaiting: 0,
			stuckRecords: [],
			verboseDiagnostics: true,
			lastCheck: null,
			recentErrors: [],
		});
		expect(text).toContain('WordPress: unknown\nWooCommerce: unknown\nWCPOS: unknown');
		expect(text).not.toContain('Platform:');
		expect(text).not.toContain('WCPOS Pro:');
		expect(text).toContain('Last server check: none yet');
		expect(text).toContain('Recent errors (0):');
		expect(text).toContain('  none');
	});
});

describe('buildLogEntryReport', () => {
	/**
	 * The row that prompted this: the copy action used to yield
	 * `push.money-divergence` and nothing else — the kind of thing that happened,
	 * with no order, no figures and no error code. Everything a support thread
	 * needs was in `context`, one line below it on screen.
	 */
	const divergenceRow: LogRow = {
		logId: 'log-9',
		timestamp: Date.parse('2026-08-23T18:16:04.000Z'),
		level: 'error',
		code: 'CHECKOUT401',
		category: 'wcpos.sync.engine',
		message: "order a5d24ec5 — the server's totals differ from the POS calculation",
		context: {
			type: 'push.money-divergence',
			collection: 'orders',
			recordId: 'a5d24ec5-6790-4594-940d-7db0dec10195',
			mode: 'exact-6dp',
			divergentFields: 'total',
			detail: 'total: 65.390000 -> 65.400000',
		},
	};

	it('carries the figures support needs, not just the event code', () => {
		const text = buildLogEntryReport(divergenceRow);

		expect(text).toContain('WCPOS log entry — 2026-08-23T18:16:04.000Z');
		expect(text).toContain('Level: error');
		expect(text).toContain('Event: push.money-divergence');
		expect(text).toContain('Error code: CHECKOUT401');
		expect(text).toContain('Category: wcpos.sync.engine');
		expect(text).toContain("Message: order a5d24ec5 — the server's totals differ");
		// THE line the merchant was pasting a bare event code instead of.
		expect(text).toContain('"detail": "total: 65.390000 -> 65.400000"');
		expect(text).toContain('"recordId": "a5d24ec5-6790-4594-940d-7db0dec10195"');
	});

	/**
	 * The ledger hides attribution because it "stays in the data for export and
	 * support" (ledger.tsx). This is that export — omitting the actor made the
	 * ledger's stated reason untrue.
	 */
	it('carries the actor the ledger deliberately does not show', () => {
		const text = buildLogEntryReport({
			...divergenceRow,
			actor: { id: '12', role: 'cashier', name: 'Ada' },
		});

		expect(text).toContain('Actor: Ada (cashier, id 12)');
	});

	it.each([
		[{ name: 'Ada' }, 'Actor: Ada'],
		[{ id: '12' }, 'Actor: id 12'],
		[{ role: 'cashier', id: '12' }, 'Actor: cashier, id 12'],
		[{ name: 'Ada', id: '12' }, 'Actor: Ada (id 12)'],
	])('renders a partial actor %j as %s', (actor, expected) => {
		expect(buildLogEntryReport({ ...divergenceRow, actor })).toContain(expected);
	});

	it.each([[null], [undefined], [{}], [{ name: '  ', role: '' }]])(
		'omits the actor line entirely for %j',
		(actor) => {
			expect(buildLogEntryReport({ ...divergenceRow, actor })).not.toContain('Actor:');
		}
	);

	it('does not repeat an event-code message as prose', () => {
		const text = buildLogEntryReport({
			...divergenceRow,
			message: 'push.money-divergence',
		});

		expect(text).toContain('Event: push.money-divergence');
		expect(text).not.toContain('Message:');
	});

	it('reports a row that carries no context at all', () => {
		const text = buildLogEntryReport({
			logId: 'log-1',
			timestamp: Date.parse('2026-08-23T18:16:04.000Z'),
			level: 'info',
		});

		expect(text).toBe('WCPOS log entry — 2026-08-23T18:16:04.000Z\nLevel: info\nLog id: log-1');
	});

	it('still yields a report when the context cannot be serialized', () => {
		const circular: Record<string, unknown> = { type: 'apply.pull' };
		circular.self = circular;

		const text = buildLogEntryReport({ ...divergenceRow, context: circular });

		expect(text).toContain('Event: apply.pull');
		expect(text).toContain('[details could not be serialized]');
	});
});

describe('shouldExtendLedger', () => {
	const base = {
		offsetY: 1_000,
		contentHeight: 2_000,
		viewportHeight: 800,
		renderedCount: 20,
		total: 100,
		lastExtendCount: null,
	};

	it('extends near the bottom when more rows exist', () => {
		expect(shouldExtendLedger(base)).toBe(true);
	});

	it('does nothing far from the bottom', () => {
		expect(shouldExtendLedger({ ...base, offsetY: 0 })).toBe(false);
	});

	it('does nothing once every row is loaded', () => {
		expect(shouldExtendLedger({ ...base, total: 20 })).toBe(false);
	});

	it('refuses a second extend until rows actually materialized (#1132 phantom trigger)', () => {
		// The limit widened but the rows have not arrived yet: still 20 rendered.
		expect(shouldExtendLedger({ ...base, lastExtendCount: 20 })).toBe(false);
		// The window materialized (40 rows): the next extend is allowed.
		expect(shouldExtendLedger({ ...base, renderedCount: 40, lastExtendCount: 20 })).toBe(true);
	});

	it('extends when content is shorter than the viewport (fill-on-tall-screens)', () => {
		expect(
			shouldExtendLedger({
				...base,
				offsetY: 0,
				contentHeight: 600,
				viewportHeight: 900,
			})
		).toBe(true);
	});
});
