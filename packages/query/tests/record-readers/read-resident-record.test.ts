import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { readResidentRecord } from '../../src/record-readers';

function engineWith(collections: Record<string, unknown> | null) {
	return {
		active: () => (collections === null ? null : { database: { collections } }),
	} as unknown as RxdbSyncEngine;
}

describe('readResidentRecord', () => {
	it('reads the requested resident record from the active collection', async () => {
		const doc = { uuid: 'product-1', payload: { name: 'Coffee' } };
		const findOne = jest.fn(() => ({ exec: async () => doc }));
		expect(
			await readResidentRecord(engineWith({ products: { findOne } }), 'products', 'product-1')
		).toBe(doc);
		expect(findOne).toHaveBeenCalledWith('product-1');
	});

	it.each([null, {}])('returns null without a scope or collection (%s)', async (collections) => {
		expect(await readResidentRecord(engineWith(collections), 'products', 'missing')).toBeNull();
	});

	it('returns null for a missing record and propagates storage failures', async () => {
		const exec = jest
			.fn()
			.mockResolvedValueOnce(null)
			.mockRejectedValueOnce(new Error('storage failed'));
		const engine = engineWith({ products: { findOne: () => ({ exec }) } });
		expect(await readResidentRecord(engine, 'products', 'missing')).toBeNull();
		await expect(readResidentRecord(engine, 'products', 'missing')).rejects.toThrow(
			'storage failed'
		);
	});
});
