import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import type { StoreDatabase, UserDatabase } from '@wcpos/database';
import { closuresLiteral } from '@wcpos/database/collections/schemas/closures';
import { registerSessionsLiteral } from '@wcpos/database/collections/schemas/register-sessions';
import { cashMovementsLiteral } from '@wcpos/database/collections/schemas/cash-movements';

import { ensureRegister, readRegister } from '../register/register-document';
import {
	closeSession,
	openSession,
	recordMovement,
	voidMovement,
	writeClosure,
} from './session-store';

addRxPlugin(RxDBLocalDocumentsPlugin);
let db: StoreDatabase;
let userDB: UserDatabase;
beforeEach(async () => {
	db = await createRxDatabase({
		name: `closure${Math.random().toString(36).slice(2)}`,
		storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
		multiInstance: false,
	});
	userDB = await createRxDatabase({
		name: `user${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		localDocuments: true,
		multiInstance: false,
	});
	await db.addCollections({
		closures: { schema: closuresLiteral },
		register_sessions: { schema: registerSessionsLiteral },
		cash_movements: { schema: cashMovementsLiteral },
	});
	await ensureRegister(userDB);
});
afterEach(async () => {
	await db.remove();
	await userDB.remove();
});
async function seed() {
	let session = await openSession(db.register_sessions, {
		registerId: 'register',
		expectedFloat: '100',
		countedFloat: '100',
		openedBy: 7,
	});
	for (const [type, amount] of [
		['paid_in', '20'],
		['paid_out', '5'],
		['paid_out', '7'],
	] as const) {
		const row = await recordMovement(db.cash_movements, {
			sessionId: session.id,
			type,
			amount,
			reason: '',
			actor: 7,
		});
		if (amount === '7') await voidMovement(db.cash_movements, row.id, 7);
	}
	session = await closeSession(db.register_sessions, session.id, { counted: { cash: '150' } });
	const orders = [
		{
			uuid: 'order',
			local: { dirty: true },
			payload: {
				meta_data: [
					{ key: '_wcpos_session', value: session.id },
					{ key: '_wcpos_sale_counter', value: '8' },
					{ key: '_pos_user', value: '7' },
					{
						key: '_wcpos_payments',
						value: {
							schema: 1,
							payments: [
								{
									id: 'cash',
									session_id: session.id,
									kind: 'cash',
									method_id: 'cash',
									status: 'captured',
									amount: '50',
									refunded_amount: '10',
								},
								{
									id: 'card',
									session_id: session.id,
									kind: 'card',
									method_id: 'card',
									status: 'captured',
									amount: '30',
									refunded_amount: '0',
								},
								{
									id: 'other-session',
									session_id: 'other',
									kind: 'cash',
									method_id: 'cash',
									status: 'captured',
									amount: '99',
									refunded_amount: '0',
								},
							],
						},
					},
				],
				tax_lines: [{ rate_id: 1, rate_percent: 20, tax_total: '10', shipping_tax_total: '2' }],
			},
		},
	];
	return {
		closures: db.closures,
		userDB,
		siteUuid: 'site',
		session,
		counted: '150',
		otherTenders: {},
		movements: await db.cash_movements.find().exec(),
		orders,
	};
}
it('freezes the count figures and breakdowns; retries reuse one number and one period increment', async () => {
	const input = await seed();
	const [row, repeated] = await Promise.all([writeClosure(input), writeClosure(input)]);
	expect(repeated.id).toBe(row.id);
	expect(row.toJSON()).toMatchObject({
		number: 1,
		till_expected: { cash: '155.0000', card: '30.0000' },
		variance: { cash: '-5.0000' },
		period_sales_total: '80.0000',
		period_refunds_total: '10.0000',
		perpetual_sales_total: '80.0000',
		perpetual_refunds_total: '10.0000',
		unsynced_count: 6,
		unsynced_total: '109.0000',
		first_sale_counter: 8,
		last_sale_counter: 8,
		sync_status: 'pending',
		breakdowns: {
			opening_float: { expected: '100', counted: '100', variance: '0.0000' },
			transaction_count: 1,
			refund_count: 1,
			cashiers: ['7'],
			payment_methods: {
				cash: { sales: '50.0000', refunds: '10.0000' },
				card: { sales: '30.0000', refunds: '0.0000' },
			},
			tax_rates: { '1': { net: '60.0000', tax: '12.0000', gross: '72.0000' } },
		},
	});
	expect((await writeClosure(input)).number).toBe(1);
	expect((await readRegister(userDB))?.sites.site).toMatchObject({
		last_closure_number: 1,
		perpetual_sales_total: '80.0000',
		perpetual_refunds_total: '10.0000',
	});
});
it('resumes after the insert or perpetual write was interrupted without minting or adding twice', async () => {
	const input = await seed();
	const insert = jest.spyOn(db.closures, 'insert').mockRejectedValueOnce(new Error('disk write'));
	await expect(writeClosure(input)).rejects.toThrow('disk write');
	insert.mockRestore();
	const row = await writeClosure(input);
	expect(row.number).toBe(1);
	expect(await db.closures.count().exec()).toBe(1);
});
