import {
	readAwaitingCustomer,
	readLedger,
	withAwaitingCustomer,
	withLedger,
} from '@wcpos/order-math';
import type { PaymentRow } from '@wcpos/order-math';

import { insertEngineResident } from '../../src/mutations';
import { mirrorMoneyAnswer } from '../../src/mutations/money-answer';
import { createEngineDatabase, createFakeEngine } from '../../src/testing';

import type { QueryRuntime } from '../../src/provider';
import type { RxDatabase } from 'rxdb';

describe('mirrorMoneyAnswer', () => {
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
			(
				(await database.orders.findOne('order').exec())!.toJSON() as {
					payload: { meta_data: never };
				}
			).payload.meta_data
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
		await mirrorMoneyAnswer(manager, 'order', {
			payment: row({ id: 'card-b' }),
			order: summary('pos-partial'),
			sentRevision: 'sha256:sent',
		});
		expect((await ledger()).map(({ id }) => id)).toEqual(['cash-a', 'card-b']);
		expect(await status()).toBe('pos-partial');
		expect(write).not.toHaveBeenCalled();
		await expect(mirrorMoneyAnswer(manager, 'product', {})).rejects.toThrow(
			'missing from "orders"'
		);
	});

	it('two partial records with failed refreshes both remain counted locally', async () => {
		await seed([]);
		await mirrorMoneyAnswer(manager, 'order', {
			payment: row({ id: 'a' }),
			sentRevision: 'sha256:sent',
		});
		await mirrorMoneyAnswer(manager, 'order', {
			payment: row({ id: 'b' }),
			sentRevision: 'sha256:sent',
		});
		expect((await ledger()).filter(({ status: s }) => s === 'captured')).toHaveLength(2);
	});

	it('a mirror after a pull adopted a newer document keeps the row and leaves the status', async () => {
		await seed([], 'sha256:newer');
		await mirrorMoneyAnswer(manager, 'order', {
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
		await mirrorMoneyAnswer(manager, 'order', {
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

	// The store lowercases the ids it is given; the ledger matches rows case-insensitively, and so
	// must the merge, or a delayed answer would replace the newer row outright (Codex on #2830).
	it('a delayed answer whose id differs only in case never overwrites the newer row', async () => {
		await seed([row({ id: 'ABC', status: 'voided', updated_at_gmt: '2026-10-20T11:00:00' })]);
		await mirrorMoneyAnswer(manager, 'order', {
			payment: row({ id: 'abc', status: 'captured', updated_at_gmt: '2026-10-20T10:00:00' }),
		});
		expect(await ledger()).toEqual([expect.objectContaining({ id: 'ABC', status: 'voided' })]);
	});

	it('an authorized answer arriving after a tipped capture with the same updated_at_gmt cannot regress the captured amount, even when refresh fails', async () => {
		await seed([row({ status: 'captured', amount: '55.0000' })]);
		await mirrorMoneyAnswer(manager, 'order', {
			payment: row({ status: 'authorized', amount: '50.0000' }),
			sentRevision: 'sha256:sent',
		});
		expect(await ledger()).toEqual([
			expect.objectContaining({ status: 'captured', amount: '55.0000' }),
		]);
		await mirrorMoneyAnswer(manager, 'order', {
			payment: row({ status: 'voided', amount: '55.0000' }),
			sentRevision: 'sha256:sent',
		});
		expect((await ledger())[0].status).toBe('voided');
	});

	// The app stamps rows to the millisecond with `Z`, the store to the second with `+00:00`
	// (`gmdate('c')`): timestamps are compared as instants at the store's granularity, and within one
	// second the more advanced state wins, whatever the strings' spelling.
	it('a captured answer stamped +00:00 replaces a pending app row from the same second', async () => {
		const pending = row({
			id: 'row',
			status: 'pending',
			updated_at_gmt: '2026-10-20T10:00:00.123Z',
		});
		await seed([pending]);
		// An answer a whole second older loses, in either spelling.
		await mirrorMoneyAnswer(manager, 'order', {
			payment: { ...pending, status: 'captured', updated_at_gmt: '2026-10-20T09:59:59+00:00' },
		});
		expect((await ledger())[0].status).toBe('pending');
		await mirrorMoneyAnswer(manager, 'order', {
			payment: { ...pending, status: 'captured', updated_at_gmt: '2026-10-20T10:00:00+00:00' },
		});
		expect((await ledger())[0].status).toBe('captured');
	});

	// A gateway answer's stamp change (an invoice sent or cancelled) is the answer's view of the order
	// at its own revision: once a newer document was adopted (another till sent a new invoice), an
	// older answer never rewrites that metadata; under its own revision it does.
	it.each([
		['a newer adopted document', 'sha256:newer', true],
		['the revision it was sent under', 'sha256:sent', false],
	])('a gateway stamp change applies only under %s', async (_, revision, kept) => {
		const order = await seed([], revision);
		const stamp = {
			method_id: 'invoice',
			destination: null,
			attempt_id: 'new',
			sent_at_gmt: '',
			cashier_id: 0,
		};
		await order.incrementalModify((doc) => ({
			...doc,
			payload: {
				...doc.payload,
				meta_data: withAwaitingCustomer(doc.payload.meta_data as never[], stamp),
			},
		}));
		await mirrorMoneyAnswer(manager, 'order', {
			order: summary('pos-open'),
			sentRevision: 'sha256:sent',
			meta: (meta) => withAwaitingCustomer(meta, null),
		});
		const meta = (
			(await database.orders.findOne('order').exec())!.toJSON() as {
				payload: { meta_data: { key: string; value: unknown }[] };
			}
		).payload.meta_data;
		expect(readAwaitingCustomer(meta) !== null).toBe(kept);
	});
});
