import {
	buildDebugInfo,
	chainMarkedIds,
	deriveStuckRecords,
	displayCategory,
	displayKind,
	formatCadence,
	formatDurationMs,
	type LogRow,
	presetFilters,
	rowDetailData,
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

	it('falls back to the record level', () => {
		expect(displayKind({ level: 'debug' })).toBe('debug');
		expect(displayKind({ level: 'info' })).toBe('info');
		expect(displayKind({})).toBe('info');
	});
});

describe('presetFilters', () => {
	it('excludes debug unless verbose diagnostics is on', () => {
		expect(presetFilters('all', false)).toEqual({ level: ['info', 'warn', 'error'] });
		expect(presetFilters('all', true)).toEqual({ level: ['debug', 'info', 'warn', 'error'] });
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
		row({ logId, timestamp, outcome, operationType: 'sync.record', context, level: 'error' });

	it('rules stuck from the latest decisive outcome per record', () => {
		const rows = [
			recordRow('newest', 300, 'failed', {
				recordId: 812,
				collection: 'products',
				reason: 'invalid tax class',
			}),
			recordRow('older-ok', 200, 'ok', { recordId: 812, collection: 'products' }),
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
			recordRow('failed-before', 200, 'failed', { recordId: 812, collection: 'products' }),
		];
		expect(deriveStuckRecords(rows)).toHaveLength(0);
	});

	it('skips cancelled/unknown rows so an older decisive row can rule', () => {
		const rows = [
			recordRow('aborted', 300, 'cancelled', { recordId: 9, collection: 'products' }),
			recordRow('rejected', 200, 'rejected', { recordId: 9, collection: 'products', reason: 'no' }),
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
			recordRow('a', 100, 'failed', { recordId: 1, collection: 'products', reason: 'x' }),
			recordRow('b', 300, 'failed', { recordId: 2, collection: 'orders', reason: 'y' }),
		].map((r, index) => ({ ...r, count: index + 2, lastSeen: r.timestamp }));
		const stuck = deriveStuckRecords(rows.sort((a, b) => b.timestamp - a.timestamp));
		expect(stuck.map((s) => s.recordId)).toEqual(['2', '1']);
		expect(stuck[0].attempts).toBeGreaterThan(1);
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
				context: { status: 400, serverCode: 'woocommerce_rest_invalid_tax_class' },
			})
		);
		expect(detail.operation).toBe('op_9d21 · sync.record');
		expect(detail.request).toBe('c41a88 · 400 · 500 ms');
		expect(detail.serverCode).toBe('woocommerce_rest_invalid_tax_class');
		expect(detail.attempts).toEqual({ count: 3, firstSeen: 1_000, lastSeen: 2_000 });
	});

	it('falls back to the legacy context errorCode and omits empty sections', () => {
		const detail = rowDetailData(row({ context: { errorCode: 'SY01001' } }));
		expect(detail.serverCode).toBe('SY01001');
		expect(detail.operation).toBeUndefined();
		expect(detail.request).toBeUndefined();
		expect(detail.attempts).toBeUndefined();
	});
});

describe('buildDebugInfo', () => {
	it('produces a self-contained plain-text summary', () => {
		const text = buildDebugInfo({
			generatedAt: '2026-07-31T00:00:00.000Z',
			appVersion: '1.10.0',
			connectivity: 'online',
			eventsToday: 187,
			errorsToday: 2,
			salesWaiting: 0,
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
		expect(text).toContain('App version: 1.10.0');
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
			connectivity: 'offline',
			eventsToday: 0,
			errorsToday: 0,
			salesWaiting: 0,
			stuckRecords: [],
			verboseDiagnostics: true,
			lastCheck: null,
			recentErrors: [],
		});
		expect(text).toContain('Last server check: none yet');
		expect(text).toContain('Recent errors (0):');
		expect(text).toContain('  none');
	});
});
