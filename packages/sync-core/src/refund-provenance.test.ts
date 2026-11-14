import { expect, it } from 'vitest';

import { hasPosRefundStamp } from './index';

// Remove the export or revert to session/register-only stamps: Pro refund provenance is lost.
it('recognizes each POS refund stamp and rejects metadata without one', () => {
	expect(typeof hasPosRefundStamp).toBe('function');
	for (const key of ['_wcpos_session', '_wcpos_register', '_pos_user', '_pos_store']) {
		expect(hasPosRefundStamp([{ key: 'unrelated' }, { key, value: '' }])).toBe(true);
	}
	for (const metaData of [
		undefined,
		[],
		[{}],
		[{ key: '_woocommerce_pos_uuid', value: 'uuid' }],
		[{ key: '_pos_refund_destination', value: 'cash' }],
	]) {
		expect(hasPosRefundStamp(metaData)).toBe(false);
	}
});

// Revert the scoped store veto: the foreign store passes despite its other POS stamp.
it('rejects foreign stores while preserving matching and unscoped provenance', () => {
	for (const value of ['2', 2]) {
		const foreign = [
			{ key: '_pos_store', value },
			{ key: '_pos_user', value: '7' },
		];
		expect(hasPosRefundStamp(foreign, { storeId: 1 })).toBe(false);
		expect(hasPosRefundStamp(foreign)).toBe(true);
		expect(hasPosRefundStamp(foreign, {})).toBe(true);
	}
	for (const value of ['1', 1]) {
		expect(hasPosRefundStamp([{ key: '_pos_store', value }], { storeId: ' 1 ' })).toBe(true);
	}
	expect(hasPosRefundStamp([{ key: '_pos_user', value: '7' }], { storeId: 1 })).toBe(true);
});
