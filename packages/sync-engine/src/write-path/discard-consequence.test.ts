import { expect, it } from 'vitest';

import { discardConsequence } from './conflict-resolution';

it.each([
	['orders', null, {}, undefined, 'destroys-record'],
	['orders', null, {}, 'identity-ambiguous', 'keeps-record'],
	['products', '123', {}, undefined, 'may-destroy-record'],
	['orders', '123', {}, undefined, 'keeps-record'],
	['products', '0', { id: 123 }, undefined, 'may-destroy-record'],
] as const)(
	'describes %s remote=%s payload=%j reason=%s',
	(collectionName, remoteId, payload, rejectedReason, expected) => {
		const row = { collectionName, operation: 'create' as const, payload, rejectedReason };
		expect(discardConsequence({ row, resident: { remoteId }, remoteIdField: 'remoteId' })).toBe(
			expected
		);
		expect(discardConsequence({ row, resident: null, remoteIdField: 'remoteId' })).toBe(
			'keeps-record'
		);
		expect(discardConsequence({ row, resident: 'read-failed', remoteIdField: 'remoteId' })).toBe(
			'unknown'
		);
	}
);

it.each([
	['completed', undefined, 404, 'woo_rxdb_sync_record_not_found', 'destroys-record'],
	['pos-open', 'completed', 404, 'woo_rxdb_sync_record_not_found', 'keeps-record'],
	[undefined, 'pos-open', 404, 'woo_rxdb_sync_record_not_found', 'keeps-record'],
	[undefined, 'completed', 404, 'woo_rxdb_sync_record_not_found', 'destroys-record'],
	['completed', undefined, 403, 'woo_rxdb_sync_record_not_found', 'keeps-record'],
	['completed', undefined, 404, 'other', 'keeps-record'],
])(
	'gone order verdict: %s/%s %s %s → %s',
	(status, payloadStatus, rejectedStatus, rejectedReason, expected) => {
		expect(
			discardConsequence({
				row: {
					collectionName: 'orders',
					operation: 'update',
					payload: {},
					rejectedStatus,
					rejectedReason,
				},
				resident: { remoteId: '42', status, payload: { status: payloadStatus } },
				remoteIdField: 'remoteId',
			})
		).toBe(expected);
	}
);
