import { deadLetterToStuckRecord, mergeStuckRecords } from './use-dead-letter-attention';

import type { StuckRecord } from '../logs/logs-logic';

const deadLetter = {
	mutationId: 'dead-1',
	collectionName: 'orders',
	recordId: '0cf8eb74-5db6-4d1c-8be2-bd579c304662',
	operation: 'create' as const,
	origin: 'minted' as const,
	payload: {},
	baseRevision: null,
	queuedAt: '2026-08-06T16:01:10.575Z',
	status: 'rejected' as const,
	rejectedStatus: 400,
	rejectedReason: 'rest_invalid_param',
	rejectedMessage: 'Invalid parameter(s): billing',
	rejectedAt: '2026-08-06T16:01:11.000Z',
};

function logStuck(over: Partial<StuckRecord> = {}): StuckRecord {
	return {
		key: 'orders:some-other-record',
		collection: 'orders',
		recordId: 'some-other-record',
		reason: 'from this session only',
		lastSeen: 1,
		attempts: 1,
		eventType: 'push.error',
		direction: 'push',
		retryable: true,
		...over,
	};
}

describe('dead-letter attention (durable, survives restart)', () => {
	it('describes a dead letter with the server verdict a cashier can act on', () => {
		const row = deadLetterToStuckRecord(deadLetter as never);

		expect(row).toMatchObject({
			key: 'orders:0cf8eb74-5db6-4d1c-8be2-bd579c304662',
			collection: 'orders',
			reason: 'rest_invalid_param · Invalid parameter(s): billing',
			direction: 'push',
		});
		// A permanently-refused payload is not fixed by another engine tick, so the
		// panel must not offer Retry — recovery is requeue-rebuilt.
		expect(row.retryable).toBe(false);
	});

	it('falls back to the status when the server sent no reason', () => {
		const row = deadLetterToStuckRecord({
			...deadLetter,
			rejectedReason: undefined,
			rejectedMessage: undefined,
		} as never);

		expect(row.reason).toBe('400');
	});

	it('keeps the durable row when the session log has none — the restart case', () => {
		// The 2026-08-06 smoke: after a restart the log feed is empty, and the banner
		// built from it alone vanished while the queue row was still there.
		const merged = mergeStuckRecords([deadLetterToStuckRecord(deadLetter as never)], []);

		expect(merged).toHaveLength(1);
		expect(merged[0].recordId).toBe('0cf8eb74-5db6-4d1c-8be2-bd579c304662');
	});

	it('shows one entry per record, durable first, when both surfaces see it', () => {
		const durable = deadLetterToStuckRecord(deadLetter as never);
		const merged = mergeStuckRecords(
			[durable],
			[
				logStuck({ key: durable.key, recordId: durable.recordId, reason: 'session view' }),
				logStuck(),
			]
		);

		expect(merged.map((row) => row.key)).toEqual([durable.key, 'orders:some-other-record']);
		// The durable row wins on overlap: it is the one still true tomorrow.
		expect(merged[0].reason).toBe('rest_invalid_param · Invalid parameter(s): billing');
	});
});
