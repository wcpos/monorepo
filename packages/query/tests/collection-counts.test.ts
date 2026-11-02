import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { readCollectionSampleSizes } from '../src/reads/collection-counts';

function engineWith(collections: Record<string, unknown> | null) {
	return {
		active: () => (collections === null ? null : { database: { collections } }),
	} as unknown as RxdbSyncEngine;
}

describe('readCollectionSampleSizes', () => {
	it('samples the requested limit and returns serialized document lengths', async () => {
		const find = jest.fn(() => ({
			exec: async () => [{ toJSON: () => ({ a: 1 }) }, { toJSON: () => ({ name: 'Tea' }) }],
		}));
		expect(
			await readCollectionSampleSizes(engineWith({ products: { find } }), 'products', 2)
		).toEqual([7, 14]);
		expect(find).toHaveBeenCalledWith({ limit: 2 });
	});

	it.each([null, {}])('returns null without a scope or collection (%s)', async (collections) => {
		expect(await readCollectionSampleSizes(engineWith(collections), 'products', 25)).toBeNull();
	});

	it('returns null when the engine is disposed', async () => {
		const engine = {
			active: () => {
				throw new Error('disposed');
			},
		} as unknown as RxdbSyncEngine;
		expect(await readCollectionSampleSizes(engine, 'products', 25)).toBeNull();
	});

	it('preserves empty samples and propagates storage failures', async () => {
		const exec = jest
			.fn()
			.mockResolvedValueOnce([])
			.mockRejectedValueOnce(new Error('storage failed'));
		const engine = engineWith({ products: { find: () => ({ exec }) } });
		expect(await readCollectionSampleSizes(engine, 'products', 25)).toEqual([]);
		await expect(readCollectionSampleSizes(engine, 'products', 25)).rejects.toThrow(
			'storage failed'
		);
	});
});
