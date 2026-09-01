// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createEngineHarness, remoteId } from './testing';

setPremiumFlag();

const ORDER_UUID = '5b8e1a3c-2f4d-4a6b-9c8e-000000000042';

function orderSnapshot(status: string) {
	return {
		id: 42,
		number: '42',
		status,
		date_created_gmt: '2026-09-01T10:00:00',
		date_modified_gmt: '2026-09-01T10:01:00',
		total: '10.00',
		customer_id: 0,
		meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
		line_items: [],
	};
}

afterEach(createEngineHarness.disposeTrackedEngines);

describe('RxdbSyncEngine.adoptOrderSnapshot', () => {
	it('materializes and applies a valid checkout snapshot', async () => {
		const harness = await createEngineHarness();
		const payload = orderSnapshot('completed');

		expect(await harness.engine.adoptOrderSnapshot(payload)).toBe('applied');

		const stored = (await harness.collection('orders').findOne(ORDER_UUID).exec())?.toJSON() as
			Record<string, unknown> | undefined;
		expect(stored).toMatchObject({
			uuid: ORDER_UUID,
			remoteId: remoteId(42),
			status: 'completed',
			payload: { id: 42, status: 'completed' },
		});
	});

	it('protects a resident order with pending local work', async () => {
		const harness = await createEngineHarness();
		const residentPayload = orderSnapshot('pos-open');
		await harness.seed('orders', [
			{
				uuid: ORDER_UUID,
				remoteId: remoteId(42),
				number: '42',
				dateCreatedGmt: '2026-09-01T10:00:00',
				status: 'pos-open',
				total: '10.00',
				customerId: 0,
				payload: residentPayload,
				sync: { revision: '', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
		]);
		await harness.seed('recordMutations', [
			{
				mutationId: 'mutation-42',
				seq: 1,
				status: 'pending',
				recordId: ORDER_UUID,
				collectionName: 'orders',
				operation: 'update',
				payload: { status: 'pos-open' },
				queuedAt: '2026-09-01T10:02:00.000Z',
			},
		]);

		expect(await harness.engine.adoptOrderSnapshot(orderSnapshot('completed'))).toBe('protected');

		const stored = (await harness.collection('orders').findOne(ORDER_UUID).exec())?.toJSON() as
			Record<string, unknown> | undefined;
		expect(stored?.payload).toMatchObject({ status: 'pos-open' });
	});

	it('rejects an invalid payload without writing an order', async () => {
		const harness = await createEngineHarness();

		expect(await harness.engine.adoptOrderSnapshot({ id: 42, status: '' })).toBe('invalid');
		expect(await harness.collection('orders').count().exec()).toBe(0);
	});
});
