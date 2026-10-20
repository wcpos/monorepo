import { readLedger, withLedger } from '@wcpos/order-math';
import type { PaymentRow } from '@wcpos/order-math';

import { insertEngineResident, mirrorServerOrder } from '../../src/mutations';
import { createEngineDatabase, createFakeEngine } from '../../src/testing';

import type { QueryRuntime } from '../../src/provider';
import type { RxDatabase } from 'rxdb';

let database: RxDatabase;
let manager: QueryRuntime;
const write = jest.fn();

const row = (over: Partial<PaymentRow>) =>
	({
		id: 'row-1',
		amount: '50.0000',
		status: 'captured',
		updated_at_gmt: '2026-10-20T10:00:00',
		refunds: [],
		refunded_amount: '0.0000',
		provider_refs: {},
		...over,
	}) as PaymentRow;
const summary = (status: string) =>
	({ status, total: '100.0000', payment_method: 'cash', payment_method_title: 'Cash' }) as never;

async function seed(rows: PaymentRow[], revision = 'sha256:sent') {
	const order = await insertEngineResident({
		manager,
		collection: 'orders',
		recordId: 'order',
		payload: { total: '100.0000', status: 'pos-open', meta_data: withLedger([], rows) },
	});
	await order.incrementalModify((doc) => ({ ...doc, sync: { ...doc.sync, revision } }));
	return order;
}
const ledger = async () =>
	readLedger(
		((await database.orders.findOne('order').exec())!.toJSON() as { payload: { meta_data: never } })
			.payload.meta_data
	);
const status = async () =>
	((await database.orders.findOne('order').exec())!.toJSON() as { payload: { status: string } })
		.payload.status;

beforeEach(async () => {
	database = await createEngineDatabase(['orders', 'products']);
	manager = { engine: Object.assign(createFakeEngine(database), { write }) } as QueryRuntime;
});
afterEach(async () => {
	await database.close();
});

it('a mirror upserts by row id into the latest ledger and deletes nothing', async () => {
	await seed([row({ id: 'cash-a' })]);
	await mirrorServerOrder(manager, 'order', {
		payment: row({ id: 'card-b' }),
		order: summary('pos-partial'),
		sentRevision: 'sha256:sent',
	});
	expect((await ledger()).map(({ id }) => id)).toEqual(['cash-a', 'card-b']);
	expect(await status()).toBe('pos-partial');
	expect(write).not.toHaveBeenCalled();
	await expect(mirrorServerOrder(manager, 'product', {})).rejects.toThrow('missing from "orders"');
});

it('two partial records with failed refreshes both remain counted locally', async () => {
	await seed([]);
	await mirrorServerOrder(manager, 'order', {
		payment: row({ id: 'a' }),
		sentRevision: 'sha256:sent',
	});
	await mirrorServerOrder(manager, 'order', {
		payment: row({ id: 'b' }),
		sentRevision: 'sha256:sent',
	});
	expect((await ledger()).filter(({ status: s }) => s === 'captured')).toHaveLength(2);
});

it('a mirror after a pull adopted a newer document keeps the row and leaves the status', async () => {
	await seed([], 'sha256:newer');
	await mirrorServerOrder(manager, 'order', {
		payment: row({}),
		order: summary('completed'),
		sentRevision: 'sha256:sent',
	});
	expect((await ledger()).map(({ id }) => id)).toEqual(['row-1']);
	expect(await status()).toBe('pos-open');
});

it('a late command mirror cannot erase a refund allocation or regress a row adopted from a newer server document, even when its refresh fails', async () => {
	await seed([
		row({
			status: 'voided',
			updated_at_gmt: '2026-10-20T11:00:00',
			refunds: [{ id: 7, amount: '10.0000', status: 'succeeded', provider_ref: 're_1' }],
			refunded_amount: '10.0000',
			provider_refs: { charge: 'ch_1', reader: null },
		}),
	]);
	await mirrorServerOrder(manager, 'order', {
		payment: row({
			status: 'captured',
			refunds: [{ id: 8, amount: '5.0000', status: 'pending', provider_ref: null }],
			provider_refs: { charge: null, reader: 'r1' },
		}),
		sentRevision: 'sha256:sent',
	});
	const [merged] = await ledger();
	expect(merged.status).toBe('voided');
	expect(merged.refunds.map(({ id }) => id).sort()).toEqual([7, 8]);
	expect(merged.refunded_amount).toBe('10.0000');
	expect(merged.provider_refs).toEqual({ charge: 'ch_1', reader: 'r1' });
});

it('an authorized answer arriving after a tipped capture with the same updated_at_gmt cannot regress the captured amount, even when refresh fails', async () => {
	await seed([row({ status: 'captured', amount: '55.0000' })]);
	await mirrorServerOrder(manager, 'order', {
		payment: row({ status: 'authorized', amount: '50.0000' }),
		sentRevision: 'sha256:sent',
	});
	expect(await ledger()).toEqual([
		expect.objectContaining({ status: 'captured', amount: '55.0000' }),
	]);
	await mirrorServerOrder(manager, 'order', {
		payment: row({ status: 'voided', amount: '55.0000' }),
		sentRevision: 'sha256:sent',
	});
	expect((await ledger())[0].status).toBe('voided');
});
