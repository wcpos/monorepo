import { insertEngineResident, recordReceiptPrint } from '../../src/mutations';
import { createEngineDatabase, createFakeEngine } from '../../src/testing';

import type { QueryRuntime } from '../../src/provider';

it.each([false, true])('records local prints without enqueueing (dirty=%s)', async (dirty) => {
	const database = await createEngineDatabase(['orders']);
	const write = jest.fn();
	const manager = { engine: Object.assign(createFakeEngine(database), { write }) } as QueryRuntime;
	try {
		const order = await insertEngineResident({
			manager,
			collection: 'orders',
			recordId: 'order',
			payload: { total: '10' },
		});
		await recordReceiptPrint(order, 1);
		expect(order.getLatest().local).toMatchObject({
			receiptPrintCount: 1,
			dirty: false,
			pendingMutationIds: [],
		});
		await order.incrementalPatch({
			local: { ...order.getLatest().local, dirty, pendingMutationIds: ['pending'] },
		});
		await recordReceiptPrint(order, 2);
		const latest = order.getLatest().toJSON();
		expect(latest.local).toMatchObject({
			receiptPrintCount: 2,
			dirty,
			pendingMutationIds: ['pending'],
		});
		await recordReceiptPrint(order, 2);
		await recordReceiptPrint(order, 1);
		expect(order.getLatest().toJSON()).toEqual(latest);
		expect(order.getLatest().payload).toEqual({
			total: '10',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: 'order' }],
		});
		expect(write).not.toHaveBeenCalled();
	} finally {
		await database.close();
	}
});
