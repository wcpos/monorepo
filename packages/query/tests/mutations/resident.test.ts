import { serialize } from 'node:v8';

import {
	findEngineResident,
	insertEngineResident,
	rebirthEngineResident,
	residentPayload,
} from '../../src/mutations';
import { createEngineDatabase, createFakeEngine } from '../../src/testing';

import type { QueryRuntime } from '../../src/provider';

let database: Awaited<ReturnType<typeof createEngineDatabase>>;
let manager: QueryRuntime;
const recordId = 'order-uuid';
beforeEach(async () => {
	database = await createEngineDatabase(['orders']);
	manager = { engine: createFakeEngine(database), localDB: database, locale: 'en' };
});
afterEach(async () => database.close());

it('rebirths on the same uuid, stripping server identity while retaining cart work and local state', async () => {
	const serverKeys = [
		'number',
		'order_key',
		'date_created',
		'date_created_gmt',
		'date_modified',
		'date_modified_gmt',
		'date_paid',
		'date_paid_gmt',
		'date_completed',
		'date_completed_gmt',
		'cart_hash',
		'transaction_id',
		'links',
		'_links',
		'_embedded',
	];
	const cart = {
		status: 'pos-open',
		line_items: [{ product_id: 1, quantity: 2 }],
		billing: { first_name: 'Sam' },
		meta_data: [{ key: '_woocommerce_pos_uuid', value: recordId }],
	};
	const resident = await insertEngineResident({
		manager,
		collection: 'orders',
		recordId,
		payload: { ...cart, id: 33827, ...Object.fromEntries(serverKeys.map((key) => [key, 'old'])) },
	});
	const local = { dirty: true, pendingMutationIds: ['dead-letter'] };
	await resident.incrementalPatch({
		local,
		sync: { revision: 'r1', source: 'pull', partial: false },
	});
	const reborn = await rebirthEngineResident({ manager, collection: 'orders', recordId });
	const snapshot = reborn.toMutableJSON();
	expect(snapshot).toEqual(
		expect.objectContaining({
			uuid: recordId,
			remoteId: null,
			remoteKey: '',
			local,
			sync: { revision: '', source: 'skeleton', partial: false },
		})
	);
	const payload = residentPayload(reborn);
	expect(payload).toEqual(expect.objectContaining({ ...cart, id: 0 }));
	for (const key of serverKeys) expect(payload).not.toHaveProperty(key);
	expect(() => serialize(payload)).not.toThrow();
	expect((await findEngineResident(manager, 'orders', recordId))?.toJSON()).toEqual(
		reborn.toJSON()
	);
});

it('throws when the resident is absent', async () => {
	await expect(rebirthEngineResident({ manager, collection: 'orders', recordId })).rejects.toThrow(
		'missing'
	);
});
