import { filter, firstValueFrom, type Observable, timeout } from 'rxjs';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import type {
	CashMovementRow,
	ClosureRow,
	RegisterSessionRow,
	StoreDatabase,
	UserDatabase,
} from '@wcpos/database';
import { cashMovementsLiteral } from '@wcpos/database/collections/schemas/cash-movements';
import { closuresLiteral } from '@wcpos/database/collections/schemas/closures';
import { registerSessionsLiteral } from '@wcpos/database/collections/schemas/register-sessions';

import {
	type DrawerContext,
	observeRegisterDrawer,
	observeRegisterStatus,
	type RegisterDrawer,
} from '../../src/register-session/drawer';
import {
	currentSession,
	isLiveMovement,
	unsyncedCount,
} from '../../src/register-session/drawer-rules';
import {
	markSeededIn,
	recordLiveSession,
	remintRegister,
} from '../../src/register-session/register-document';
import { createEngineDatabase, createFakeEngine, engineOrder } from '../../src/testing';

addRxPlugin(RxDBLocalDocumentsPlugin);
let storeDB: StoreDatabase;
let userDB: UserDatabase;
let engineDB: RxDatabase;
let ctx: DrawerContext;
const row = {
	id: 's1',
	register_id: 'A',
	status: 'open' as const,
	opened_at_gmt: '2026-10-28T13:05:00.000Z',
	counted_float: '100.0000',
	sync_status: 'synced' as const,
	sync_attempts: 0,
};
const movement = (patch: Record<string, unknown>): CashMovementRow => ({
	id: 'm1',
	session_id: 's1',
	type: 'paid_in',
	amount: '20',
	reason: '',
	created_by: 7,
	created_at_gmt: '2026-10-28T13:30:00.000Z',
	sync_status: 'synced',
	sync_attempts: 0,
	...(patch as Partial<CashMovementRow>),
});
const closure = (
	id: string,
	sync_status: ClosureRow['sync_status'],
	closed_at = '2026-10-28T18:00:00.000Z'
): ClosureRow => ({
	id,
	session_id: id,
	register_id: 'A',
	number: 1,
	opened_at: row.opened_at_gmt,
	closed_at,
	till_expected: {},
	expected: {},
	counted: {},
	variance: {},
	period_sales_total: '0',
	period_refunds_total: '0',
	perpetual_sales_total: '0',
	perpetual_refunds_total: '0',
	unsynced_count: 0,
	unsynced_total: '0',
	software_version: '1',
	breakdowns: {},
	order_ids: [],
	movement_ids: [],
	sync_status,
	sync_attempts: 0,
	print_count: 0,
	closed_by: 8,
});
const sale = (
	id: number,
	amount: string,
	local: { dirty: boolean; pendingMutationIds: string[] } = { dirty: false, pendingMutationIds: [] }
) => ({
	...engineOrder({
		uuid: `order-${id}`,
		id,
		date_modified_gmt: '2026-10-28T14:00:00',
		meta_data: [
			{
				key: '_wcpos_payments',
				value: {
					schema: 1,
					payments: [
						{
							id: `leg-${id}`,
							created_at_gmt: '2026-10-28T14:00:00',
							updated_at_gmt: '2026-10-28T14:00:00',
							session_id: 's1',
							kind: 'cash',
							method_id: 'cash',
							status: 'captured',
							amount,
							refunded_amount: '0',
							refunds: [],
						},
					],
				},
			},
		],
	}),
	local,
});

beforeEach(async () => {
	storeDB = await createRxDatabase({
		name: `drawer${Math.random().toString(36).slice(2)}`,
		storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
		multiInstance: false,
	});
	userDB = await createRxDatabase({
		name: `draweruser${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		localDocuments: true,
		multiInstance: false,
	});
	await storeDB.addCollections({
		register_sessions: { schema: registerSessionsLiteral, autoMigrate: false },
		cash_movements: { schema: cashMovementsLiteral, autoMigrate: false },
		closures: { schema: closuresLiteral, autoMigrate: false },
	});
	await remintRegister(userDB);
	engineDB = await createEngineDatabase(['orders', 'refunds']);
	ctx = { storeDB, userDB, siteUuid: 'site', engine: createFakeEngine(engineDB) };
});
afterEach(async () => {
	await storeDB.remove();
	await userDB.remove();
	await engineDB.close();
});

const insert = (patch: Partial<RegisterSessionRow> = {}) =>
	storeDB.register_sessions.insert({ ...row, ...patch });
/** The first snapshot the predicate accepts. */
const drawer = (accept: (value: RegisterDrawer) => boolean = () => true) =>
	firstValueFrom(
		(observeRegisterDrawer(ctx, 'A') as Observable<RegisterDrawer | null>).pipe(
			filter((value): value is RegisterDrawer => value !== null && accept(value)),
			timeout(3000)
		)
	);

describe('the current session', () => {
	// Moved from bridge.test.tsx with its assertions: the rule is query's now.
	it('recovers only an interrupted local close; imported history and written closures are never current', () => {
		const closed = {
			id: 'history',
			closure_id: 'history',
			status: 'closed',
			sync_status: 'synced',
		};
		const rows = { active: [] as (typeof closed)[], closed: [closed] };
		// Imported closed history: synced, no local closure row.
		expect(currentSession(rows, [])).toBeNull();
		// A close this till made whose closure write was interrupted: pending, no closure row.
		const interrupted = {
			id: 'mine',
			closure_id: 'mine',
			status: 'closed',
			sync_status: 'pending',
		};
		rows.closed = [closed, interrupted];
		expect(currentSession(rows, [])?.id).toBe('mine');
		// Once the closure row exists the closed session is history, whatever its sync state.
		const written = [{ id: 'mine', sync_status: 'pending' }];
		expect(currentSession(rows, written)).toBeNull();
		rows.active = [
			{ id: 'counting', closure_id: null as never, status: 'counting', sync_status: 'synced' },
		];
		expect(currentSession(rows, written)?.id).toBe('counting');
	});

	it('keeps a refused close current while its closure is unaccepted, from the database', async () => {
		await insert({ status: 'closed', sync_status: 'failed', closure_id: 's1' });
		await storeDB.closures.insert(closure('s1', 'pending'));
		const snapshot = await drawer((value) => value.session !== null);
		expect(snapshot.session?.id).toBe('s1');
		expect(snapshot.refusedClose).toBe(true);
		await (await storeDB.closures.findOne('s1').exec())!.incrementalPatch({
			sync_status: 'synced',
		});
		const settled = await drawer((value) => value.session === null);
		expect(settled.lastClosure?.id).toBe('s1');
	});

	it('the status read applies the same rule', async () => {
		await insert({ status: 'closed', sync_status: 'pending', closure_id: 's1' });
		const status = await firstValueFrom(
			observeRegisterStatus(storeDB, 'A').pipe(filter(Boolean), timeout(3000))
		);
		expect(status.session?.id).toBe('s1');
		await storeDB.closures.insert(closure('s1', 'pending'));
		const written = await firstValueFrom(
			observeRegisterStatus(storeDB, 'A').pipe(
				filter((value) => value !== null && value.session === null),
				timeout(3000)
			)
		);
		expect(written?.session).toBeNull();
	});

	it('is one stream per register', () => {
		expect(observeRegisterDrawer(ctx, 'A')).toBe(observeRegisterDrawer(ctx, 'A'));
		expect(observeRegisterDrawer(ctx, 'A')).not.toBe(observeRegisterDrawer(ctx, 'B'));
		expect(observeRegisterStatus(storeDB, 'A')).toBe(observeRegisterStatus(storeDB, 'A'));
	});
});

it('derives expected from the float, the session’s cash sales and its live movements', async () => {
	await insert();
	await engineDB.collections.orders.insert(sale(2, '10'));
	await storeDB.cash_movements.bulkInsert([
		movement({ id: 'm1', amount: '20' }),
		movement({ id: 'm2', type: 'paid_out', amount: '5', voided_by: 'v2' }),
		movement({ id: 'v2', type: 'void', amount: '0', voids: 'm2' }),
		movement({ id: 'other', session_id: 'elsewhere', amount: '99' }),
	]);
	const snapshot = await drawer((value) => value.salesCount === 1);
	expect(snapshot.expected).toEqual({ cash: '130.0000' });
	expect(snapshot.terms?.expected).toBe('130.0000');
	expect(snapshot.movements.map(({ id }) => id).sort()).toEqual(['m1', 'm2', 'v2']);
	expect(snapshot.movements.filter((entry) => isLiveMovement(entry, snapshot.movements))).toEqual([
		expect.objectContaining({ id: 'm1' }),
	]);
});

describe('unsynced, by the closure row’s rule', () => {
	it.each([
		['synced', 0],
		['pending', 1],
		['failed', 1],
	])(
		'counts the session itself while %s, with its dirty sales and unaccepted movements',
		async (sync_status, own) => {
			// A counting session whose closure the store has not taken: a held retry (#3304) is `failed`.
			await insert({
				status: 'counting',
				sync_status: sync_status as RegisterSessionRow['sync_status'],
			});
			await storeDB.closures.insert(closure('s1', 'pending'));
			await engineDB.collections.orders.insert(
				sale(2, '10', { dirty: true, pendingMutationIds: ['w'] })
			);
			await engineDB.collections.orders.insert(sale(3, '10'));
			await storeDB.cash_movements.bulkInsert([
				movement({ id: 'm1', sync_status: 'pending' }),
				movement({ id: 'm2', sync_status: 'failed' }),
				movement({ id: 'm3', sync_status: 'synced' }),
			]);
			const snapshot = await drawer((value) => value.salesCount === 2);
			expect(snapshot.unsyncedCount).toBe(1 + 2 + own);
			expect(snapshot.unsyncedCount).toBe(
				unsyncedCount({ sync_status }, [{ local: { dirty: true } }, {}], snapshot.movements)
			);
		}
	);
});

it('scopes refused movements by register for the pane and by session for the closure row', async () => {
	await insert({ id: 'old', status: 'closed', closure_id: 'old' });
	await storeDB.closures.insert(closure('old', 'synced', '2026-10-27T18:00:00.000Z'));
	await insert();
	await storeDB.cash_movements.bulkInsert([
		movement({ id: 'earlier', session_id: 'old', sync_status: 'failed' }),
		movement({ id: 'here', sync_status: 'failed' }),
		movement({ id: 'no-sale', type: 'no_sale', amount: '0', sync_status: 'failed' }),
		movement({ id: 'other-register', session_id: 'elsewhere', sync_status: 'failed' }),
	]);
	const snapshot = await drawer((value) => value.movements.length === 2);
	expect(snapshot.refusedMovements.map(({ id }) => id).sort()).toEqual([
		'earlier',
		'here',
		'no-sale',
	]);
	expect(snapshot.refusedCash.map(({ id }) => id)).toEqual(['here']);
});

it('§ 4.9 invariant 1: a seeded session’s figures are pending until the server’s baseline', async () => {
	await insert({ server_expected_at: null });
	await recordLiveSession(userDB, 'site', 'A', {
		session_id: 's1',
		status: 'open',
		opened_at_gmt: row.opened_at_gmt,
		opened_by: { id: 7, name: 'Pat' },
		acknowledged: true,
		expected_float: null,
		counted_float: null,
		business_day: null,
	});
	expect((await drawer()).figuresPending).toBe(false);
	await markSeededIn(userDB, 'site', 'A', storeDB.name);
	await drawer((value) => value.figuresPending);
	await (await storeDB.register_sessions.findOne('s1').exec())!.incrementalPatch({
		server_expected_at: '2026-10-28T14:00:00.000Z',
		server_expected: { cash: '100' },
	});
	const settled = await drawer((value) => !value.figuresPending);
	expect(settled.expected.cash).toBe('100');
});
