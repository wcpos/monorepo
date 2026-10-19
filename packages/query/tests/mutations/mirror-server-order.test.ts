import { insertEngineResident, mirrorServerOrder } from '../../src/mutations';
import { createEngineDatabase, createFakeEngine } from '../../src/testing';

import type { QueryRuntime } from '../../src/provider';

it('mirrors only the supplied order fields without enqueuing or touching other collections', async () => {
	const database = await createEngineDatabase(['orders', 'products']);
	const write = jest.fn();
	const manager = { engine: Object.assign(createFakeEngine(database), { write }) } as QueryRuntime;
	try {
		const order = await insertEngineResident({
			manager,
			collection: 'orders',
			recordId: 'order',
			payload: { total: '10', status: 'pending' },
		});
		const product = await insertEngineResident({
			manager,
			collection: 'products',
			recordId: 'product',
			payload: { name: 'Unchanged' },
		});
		const changes = {
			status: 'completed',
			total: '11',
			payment_method: 'device',
			payment_method_title: 'Reader',
			meta_data: [{ key: '_wcpos_payments', value: 'server' }],
		};
		await mirrorServerOrder(manager, 'order', changes);
		expect(order.getLatest().payload).toMatchObject(changes);
		await mirrorServerOrder(manager, 'order', { meta_data: [] });
		expect(order.getLatest().payload).toMatchObject({ ...changes, meta_data: [] });
		await expect(mirrorServerOrder(manager, 'product', changes)).rejects.toThrow(
			'missing from "orders"'
		);
		expect(product.getLatest().payload.name).toBe('Unchanged');
		expect(write).not.toHaveBeenCalled();
	} finally {
		await database.close();
	}
});
