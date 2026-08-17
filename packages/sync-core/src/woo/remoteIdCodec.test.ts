import { describe, expect, it } from 'vitest';

import { compareRemoteIds, mintRemoteId, remoteIdOrNull, wooIdOf } from './remoteIdCodec';

describe('mintRemoteId', () => {
	it('mints decimal strings from positive safe wire integers', () => {
		expect(mintRemoteId(42, 'order id')).toBe('42');
	});

	it('rejects values outside the positive safe-integer wire contract with label context', () => {
		for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '42', null]) {
			expect(() => mintRemoteId(value, 'order id')).toThrow(/order id/);
		}
	});
});

describe('remoteIdOrNull', () => {
	it('accepts positive safe integers and all-digit positive strings', () => {
		expect(remoteIdOrNull(42)).toBe('42');
		expect(remoteIdOrNull('0042')).toBe('42');
		expect(remoteIdOrNull('007')).toBe('7');
	});

	it('returns null for invalid ids', () => {
		for (const value of [0, -1, 1.5, '', '0', '-1', '1.5', ' 42 ', null, undefined]) {
			expect(remoteIdOrNull(value)).toBeNull();
		}
	});
});

describe('wooIdOf', () => {
	it('converts a remote id back to its wire integer', () => {
		const remoteId = mintRemoteId(42, 'order id');
		expect(wooIdOf(remoteId)).toBe(42);
	});

	it('rejects a forged non-numeric remote id', () => {
		expect(() => wooIdOf('not-an-id' as ReturnType<typeof mintRemoteId>)).toThrow(/non-numeric/);
	});
});

describe('compareRemoteIds', () => {
	it('sorts by Woo numeric order rather than lexical order', () => {
		const ids = [10, 2, 1].map((id) => mintRemoteId(id, 'id'));
		expect(ids.sort(compareRemoteIds)).toEqual(['1', '2', '10']);
	});
});
