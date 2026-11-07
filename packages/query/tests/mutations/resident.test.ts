import { serialize } from 'node:v8';

import {
	findEngineResident,
	insertEngineResident,
	rebirthOrderResident,
	recreateRebornOrder,
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
		sync: { revision: 'r1', source: 'pull', partial: true },
	});
	const reborn = await rebirthOrderResident(manager, recordId);
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
	await expect(rebirthOrderResident(manager, recordId)).rejects.toThrow('missing');
});

it('drops removed lines and server line/meta ids, preserving line uuids and other data', async () => {
	const meta = [{ id: 81, key: '_woocommerce_pos_uuid', value: 'line-uuid', extra: 'keep' }];
	const payload = {
		line_items: [
			{ id: 1, product_id: 10, quantity: 2, meta_data: meta },
			{ id: 2, product_id: null, variation_id: 22 },
			{ id: 3, product_id: 12, quantity: 0 },
		],
		fee_lines: [
			{ id: 4, name: 'Fee', total: '2', meta_data: meta },
			{ id: 5, name: null },
		],
		shipping_lines: [
			{ id: 6, method_id: 'flat_rate', meta_data: meta },
			{ id: 7, method_id: null },
		],
		coupon_lines: [
			{ id: 8, code: 'SAVE', meta_data: meta },
			{ id: 9, code: null },
		],
		tax_lines: [{ id: 10 }],
		refunds: [{ id: 11 }],
		meta_data: [{ id: 12, key: '_woocommerce_pos_uuid', value: recordId }],
	};
	await insertEngineResident({
		manager,
		collection: 'orders',
		recordId,
		payload: { ...payload, id: 42, status: 'pos-open' },
	});
	const reborn = await rebirthOrderResident(manager, recordId);
	const cleanMeta = [{ key: '_woocommerce_pos_uuid', value: 'line-uuid', extra: 'keep' }];
	expect(residentPayload(reborn)).toEqual(
		expect.objectContaining({
			line_items: [{ product_id: 10, quantity: 2, meta_data: cleanMeta }],
			fee_lines: [{ name: 'Fee', total: '2', meta_data: cleanMeta }],
			shipping_lines: [{ method_id: 'flat_rate', meta_data: cleanMeta }],
			coupon_lines: [{ code: 'SAVE', meta_data: cleanMeta }],
			tax_lines: payload.tax_lines,
			refunds: payload.refunds,
			meta_data: payload.meta_data,
		})
	);
	expect(payload.line_items[0].id).toBe(1);
	expect(meta[0].id).toBe(81);
});

it('recreates a reborn order from its current resident, as a create carrying the latest payload', async () => {
	await insertEngineResident({
		manager,
		collection: 'orders',
		recordId,
		payload: {
			id: 33827,
			number: '33827',
			status: 'pos-open',
			line_items: [{ id: 9, quantity: 1 }],
		},
	});
	await rebirthOrderResident(manager, recordId);
	const current = await findEngineResident(manager, 'orders', recordId);
	await current!.incrementalModify((old) => ({
		...old,
		payload: { ...(old.payload as Record<string, unknown>), line_items: [{ quantity: 2 }] },
	}));
	const write = jest
		.spyOn(manager.engine, 'write')
		.mockResolvedValue({ mutationId: 'create' } as never);
	await recreateRebornOrder(manager, recordId);
	expect(write).toHaveBeenCalledWith({
		collection: 'orders',
		operation: 'create',
		recordId,
		payload: expect.objectContaining({ id: 0, status: 'pos-open', line_items: [{ quantity: 2 }] }),
	});
});

it('refuses to recreate an order that is not resident', async () => {
	await expect(recreateRebornOrder(manager, recordId)).rejects.toThrow('missing');
});
