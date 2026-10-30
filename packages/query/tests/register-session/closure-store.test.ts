import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import type { StoreDatabase, UserDatabase } from '@wcpos/database';
import { closuresLiteral } from '@wcpos/database/collections/schemas/closures';
import { registerSessionsLiteral } from '@wcpos/database/collections/schemas/register-sessions';
import { cashMovementsLiteral } from '@wcpos/database/collections/schemas/cash-movements';
import { readClosure, readRegister } from '@wcpos/query/register-session';

import {
	closeSession,
	openSession,
	recordMovement,
	refreshClosureRow,
	setClosureReceiptSnapshot,
	voidMovement,
	writeClosure,
} from '../../src/register-session/session-store';
import { remintRegister } from '../../src/register-session/register-document';

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
		closures: { schema: closuresLiteral, autoMigrate: false },
		register_sessions: { schema: registerSessionsLiteral, autoMigrate: false },
		cash_movements: { schema: cashMovementsLiteral, autoMigrate: false },
	});
	await remintRegister(userDB);
});
afterEach(async () => {
	await db.remove();
	await userDB.remove();
});
async function seed() {
	let session = await openSession(db, {
		registerId: 'register',
		expectedFloat: '100',
		countedFloat: '100',
		openedBy: 7,
		businessDay: { year: 2026, month: 9, day: 16 },
	});
	for (const [type, amount] of [
		['paid_in', '20'],
		['paid_out', '5'],
		['paid_out', '7'],
	] as const) {
		const row = await recordMovement(db, {
			sessionId: session.id,
			type,
			amount,
			reason: '',
			actor: 7,
		});
		if (amount === '7') await voidMovement(db, row.id, 7);
	}
	session = await closeSession(db, session.id, {
		counted: { cash: '150' },
		closedBy: 7,
	});
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
		storeDB: db,
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
		// A reversal carries amount '0', so the unsynced total no longer counts the voided
		// paid-in twice (its own 7 plus the reversal's 7); the voided row still counts once.
		unsynced_total: '102.0000',
		first_sale_counter: 8,
		last_sale_counter: 8,
		sync_status: 'pending',
		breakdowns: {
			opening_float: { expected: '100', counted: '100', variance: '0.0000' },
			transaction_count: 1,
			refund_count: 1,
			cashiers: [{ id: 7, name: '7' }],
			payment_methods: {
				cash: { sales: '50.0000', refunds: '10.0000' },
				card: { sales: '30.0000', refunds: '0.0000' },
			},
			tax_rates: { '1': { net: '60.0000', tax: '12.0000', gross: '72.0000' } },
		},
	});
	expect((await writeClosure(input)).number).toBe(1);
	expect((await readRegister(userDB))?.sites.site.registers?.register).toMatchObject({
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

// Revert writeClosure's shared attribution/all-order ledger input: cross-session refunds disappear.
it('attributes cross-session split refunds once without importing the parent sale or taxes', async () => {
	const input = await seed();
	const allocation = (amount: string) => [{ id: 20, amount, status: 'succeeded' }];
	const refundRecords = [
		{
			id: 20,
			parent_id: 1,
			date_created_gmt: '2026-09-15T10:00:00',
			amount: '20',
			meta_data: [{ key: '_wcpos_session', value: input.session.id }],
		},
	];
	const orders = [
		{
			uuid: 'old-parent',
			payload: {
				meta_data: [
					{
						key: '_wcpos_payments',
						value: {
							schema: 1,
							payments: [
								{
									id: 'cash',
									session_id: 'old-session',
									kind: 'cash',
									method_id: 'cash',
									status: 'captured',
									amount: '100',
									refunded_amount: '7',
									refunds: allocation('7'),
								},
								{
									id: 'card',
									session_id: 'old-session',
									kind: 'card',
									method_id: 'stripe',
									status: 'captured',
									amount: '30',
									refunded_amount: '13',
									refunds: allocation('13'),
								},
							],
						},
					},
				],
				tax_lines: [{ rate_id: 1, tax_total: '10' }],
			},
		},
	];
	const refundInput = { ...input, orders, movements: [], refundRecords };
	const row = await writeClosure(refundInput);
	expect(row.toJSON()).toMatchObject({
		till_expected: { cash: '93.0000', stripe: '-13.0000' },
		period_sales_total: '0.0000',
		period_refunds_total: '20.0000',
		order_ids: [],
		breakdowns: {
			transaction_count: 0,
			refund_count: 1,
			tax_rates: {},
			payment_methods: {
				cash: { sales: '0', refunds: '7.0000' },
				stripe: { sales: '0', refunds: '13.0000' },
			},
		},
	});
	// Removing the existing-closure return would rewrite this frozen snapshot after deletion.
	const deletedInput = { ...input, orders: [], movements: [], refundRecords: [] };
	const afterDelete = await writeClosure(deletedInput);
	expect(afterDelete.toJSON()).toEqual(row.toJSON());
});

// Revert refund_count to counting payment rows: one legacy split refund is counted twice.
it('counts distinct legacy refund identities across tenders', async () => {
	const input = await seed();
	const orders = [
		{
			uuid: 'sale',
			payload: {
				meta_data: [
					{
						key: '_wcpos_payments',
						value: {
							schema: 1,
							payments: ['cash', 'card'].map((kind) => ({
								id: kind,
								session_id: input.session.id,
								kind,
								method_id: kind,
								status: 'captured',
								amount: '50',
								refunded_amount: '5',
								refunds: [{ id: 90, amount: '5', status: 'succeeded' }],
							})),
						},
					},
				],
			},
		},
	];
	const row = await writeClosure({ ...input, orders, movements: [] });
	expect(row.period_refunds_total).toBe('10.0000');
	expect(row.breakdowns.refund_count).toBe(1);
});

// Revert: omit business_day, closed_by, or snapshot labels when writeClosure builds its draft.
it('copies the opening business day unchanged when closing on a later day', async () => {
	const input = await seed();
	const closure = await writeClosure({
		...input,
		labels: { register_name: 'Front', closed_by_name: 'Pat' },
	});
	expect(closure.toJSON()).toMatchObject({
		business_day: '2026-09-16',
		closed_by: 7,
		breakdowns: { register_name: 'Front', closed_by_name: 'Pat' },
	});
});
// Revert: discard session actors and movement timestamps before their source rows are pruned.
it('retains the actor and movement data needed by the local closure document', async () => {
	const input = await seed();
	const row = await writeClosure(input);
	expect(row.breakdowns.opened_by).toBe(7);
	const movements = row.breakdowns.movements as Record<string, unknown>[];
	expect(movements[0]).toMatchObject({ created_by: 7, created_at_gmt: expect.any(String) });
	const { buildClosureDocument } =
		await import('../../../core/src/services/register-session/closure-document');
	const doc = buildClosureDocument(row.toMutableJSON(), {
		store: { name: 'Shop' },
		currency: 'USD',
		timezone: 'UTC',
		locale: 'en-US',
		printedAt: '2026-09-17T12:00:00Z',
		formatMoney: (v) => v,
		i18n: {},
	});
	expect(doc.closure).toMatchObject({ opened_by: 7, closed_by: 7 });
	expect(doc.closure.breakdowns.payment_methods.length).toBeGreaterThan(0);
	expect(doc.closure.breakdowns.movements[0].created_at.datetime).not.toBe('');
});

// Revert: omit business_day when writing a closure for an already-closed legacy session.
it('derives a legacy closure day from opening in store time', async () => {
	const input = await seed();
	const closure = await writeClosure({
		...input,
		session: {
			...input.session.toJSON(),
			business_day: undefined,
			opened_at_gmt: '2026-09-17T02:00:00Z',
		},
		...{ timezone: 'America/Los_Angeles' },
	});
	expect(closure.business_day).toBe('2026-09-16');
});

it('patches only the receipt snapshot and corrections count, including server identity', async () => {
	const closure = await writeClosure(await seed());
	await closure.incrementalPatch({ server_closure_id: 'remote' });
	const before = closure.getLatest().toJSON();
	await setClosureReceiptSnapshot(db, closure.id, '{}');
	await refreshClosureRow(db, 'remote', 3);
	await expect(readClosure(db, { serverClosureId: 'remote' })).resolves.toMatchObject({
		id: closure.id,
	});
	expect(closure.getLatest().toJSON()).toEqual({
		...before,
		receipt_snapshot: '{}',
		corrections_count: 3,
	});
	await expect(setClosureReceiptSnapshot(null, closure.id, '{}')).rejects.toMatchObject({
		name: 'StoreDatabaseUnavailableError',
	});
	await expect(refreshClosureRow(null, 'remote', 3)).rejects.toMatchObject({
		name: 'StoreDatabaseUnavailableError',
	});
});

// Omitting close-time fields or counting voided/foreign movements loses the stored document contract.
it('stores closure counters, tender/tax labels and integer denomination amounts', async () => {
	const input = await seed();
	const first = input.orders[0];
	const orders = [
		{
			...first,
			payload: {
				...first.payload,
				payment_method: 'cash',
				payment_method_title: 'Cash drawer',
				discount_total: '1.0001',
				discount_tax: '0.2000',
				coupon_lines: [{}],
				line_items: [{ quantity: 2 }, { quantity: 1.5 }],
				tax_lines: [{ rate_id: 1, label: 'VAT', rate_percent: 20, tax_total: '10' }],
			},
		},
		{
			uuid: 'second',
			payload: {
				payment_method: 'card',
				payment_method_title: 'Card',
				line_items: [{ quantity: 3 }],
				meta_data: [
					{ key: '_wcpos_session', value: input.session.id },
					{
						key: '_wcpos_payments',
						value: {
							schema: 1,
							payments: [
								{
									id: 'second-card',
									session_id: input.session.id,
									kind: 'card',
									method_id: 'card',
									status: 'captured',
									amount: '10.0001',
								},
							],
						},
					},
				],
				tax_lines: [{ rate_id: 2, label: 'Local tax', tax_total: '1' }],
			},
		},
	];
	const movement = {
		...input.movements[0].toJSON(),
		type: 'no_sale' as const,
		amount: '0',
		voided_by: null,
		voids: null,
	};
	const closure = await writeClosure({
		...input,
		orders,
		note: 'Found coins',
		denominations: [
			{ value: '0.1001', pieces: 3 },
			{ value: '50', pieces: 2 },
			{ value: '20', pieces: 0 },
		],
		movements: [
			movement,
			{ ...movement, id: 'voided', voided_by: 'v' },
			{ ...movement, id: 'foreign', session_id: 'other' },
		],
	});
	expect(closure.breakdowns).toMatchObject({
		discounts: { count: 1, amount: '1.2001' },
		items_sold: 6.5,
		average_sale: '45.0001',
		drawer_openings: 1,
		variance_note: 'Found coins',
		denominations: [
			{ value: '0.1001', pieces: 3, amount: '0.3003' },
			{ value: '50', pieces: 2, amount: '100.0000' },
		],
		payment_methods: {
			cash: { method: 'cash', name: 'Cash drawer' },
			card: { method: 'card', name: 'Card' },
		},
		tax_rates: { '1': { rate: 20, name: 'VAT 20%' }, '2': { name: 'Local tax' } },
	});
});
it('stores empty defaults for a session with no orders or count details', async () => {
	const input = await seed();
	const closure = await writeClosure({ ...input, orders: [], movements: [] });
	expect(closure.breakdowns).toMatchObject({
		discounts: { count: 0, amount: '0.0000' },
		items_sold: 0,
		average_sale: '0.0000',
		drawer_openings: 0,
		variance_note: '',
		denominations: [],
	});
});
it('keeps the first payment title and uses empty names for unknown methods', async () => {
	const input = await seed();
	const orders = ['First', 'Second'].map((name, i) => ({
		...input.orders[0],
		uuid: String(i),
		payload: { ...input.orders[0].payload, payment_method: 'card', payment_method_title: name },
	}));
	const closure = await writeClosure({ ...input, orders });
	expect(closure.breakdowns.payment_methods).toMatchObject({
		cash: { method: 'cash', name: '' },
		card: { method: 'card', name: 'First' },
	});
});
