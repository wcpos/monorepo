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
