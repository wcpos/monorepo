import { of } from 'rxjs';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import type { RegisterSessionRow, StoreDatabase, UserDatabase } from '@wcpos/database';
import { cashMovementsLiteral } from '@wcpos/database/collections/schemas/cash-movements';
import { closuresLiteral } from '@wcpos/database/collections/schemas/closures';
import { registerSessionsLiteral } from '@wcpos/database/collections/schemas/register-sessions';
import type { EngineRequirement } from '@wcpos/sync-engine';
import { remoteIdOrNull, remoteKeyFor } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { type CloseContext, closeRegister } from '../../src/register-session/close';
import {
	readLiveSession,
	readRegister,
	recordLiveSession,
	remintRegister,
} from '../../src/register-session/register-document';
import {
	recoverClosureReservation,
	RegisterSessionRequiredError,
} from '../../src/register-session/session-store';
import {
	createEngineDatabase,
	createFakeEngine,
	engineOrder,
	type FakeEngine,
} from '../../src/testing';

jest.mock('@wcpos/utils/logger', () => {
	const categories = new Map();
	return {
		getLogger: jest.fn((category: string[]) => {
			const key = category.join('.');
			if (!categories.has(key))
				categories.set(key, {
					info: jest.fn(),
					warn: jest.fn(),
					debug: jest.fn(),
					error: jest.fn(),
				});
			return categories.get(key);
		}),
	};
});
const logger = jest.mocked(getLogger(['wcpos', 'registerSession']));

addRxPlugin(RxDBLocalDocumentsPlugin);
let storeDB: StoreDatabase;
let userDB: UserDatabase;
let engineDB: RxDatabase;
let engine: FakeEngine;
let ctx: CloseContext;
const actor = { id: '7', name: 'Pat' };
const row = {
	id: 's1',
	register_id: 'A',
	status: 'counting' as const,
	opened_at_gmt: '2026-10-28T13:05:00.000Z',
	opened_by: 8,
	expected_float: '100.0000',
	counted_float: '100.0000',
	business_day: '2026-10-28',
	sync_status: 'synced' as const,
	sync_attempts: 0,
};
/** A sale's payment row, as the order's `_wcpos_payments` ledger holds it. */
const payment = (patch: Record<string, unknown>) => ({
	id: 'leg',
	created_at_gmt: '2026-10-28T14:00:00',
	updated_at_gmt: '2026-10-28T14:00:00',
	session_id: 's1',
	kind: 'cash',
	method_id: 'cash',
	status: 'captured',
	amount: '10',
	refunded_amount: '0',
	refunds: [],
	...patch,
});
const order = (id: number, modified: string, payments: Record<string, unknown>[]) =>
	engineOrder({
		uuid: `order-${id}`,
		id,
		date_modified_gmt: modified,
		meta_data: [{ key: '_wcpos_payments', value: { schema: 1, payments } }],
	});
// A card refund stamped to this session, on an order an earlier session sold.
const refund = {
	uuid: 'refund-20',
	remoteId: remoteIdOrNull(20),
	remoteKey: remoteKeyFor(remoteIdOrNull(20)),
	sessionId: 's1',
	payload: {
		id: 20,
		parent_id: 1,
		amount: '20',
		date_created_gmt: '2026-10-28T15:00:00',
		meta_data: [{ key: '_wcpos_session', value: 's1' }],
	},
	sync: { revision: '1', partial: false, source: 'woo-rest' },
	local: { dirty: false, pendingMutationIds: [] },
};
const parent = order(1, '2026-10-01T10:00:00', [
	payment({
		id: 'card',
		session_id: 'old',
		kind: 'card',
		method_id: 'stripe',
		amount: '100',
		refunded_amount: '20',
		refunds: [{ id: 20, amount: '20', status: 'succeeded' }],
	}),
]);
const site = {
	populate$: () => of([{ id: 8, display_name: 'Alex' }]),
} as unknown as CloseContext['site'];

beforeEach(async () => {
	jest.clearAllMocks();
	storeDB = await createRxDatabase({
		name: `close${Math.random().toString(36).slice(2)}`,
		storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
		multiInstance: false,
	});
	userDB = await createRxDatabase({
		name: `closeuser${Math.random().toString(36).slice(2)}`,
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
	engine = createFakeEngine(engineDB);
	ctx = {
		storeDB,
		userDB,
		siteUuid: 'site',
		actor,
		engine,
		site,
		credentials: { id: 7, display_name: 'Pat' },
		timezone: 'device',
		registerName: 'Front',
	};
});
afterEach(async () => {
	await storeDB.remove();
	await userDB.remove();
	await engineDB.close();
});
const insert = (patch: Partial<RegisterSessionRow> = {}) =>
	storeDB.register_sessions.insert({ ...row, ...patch });
const session = async () => (await storeDB.register_sessions.findOne('s1').exec())!.toJSON();
const closureRow = async () => (await storeDB.closures.findOne('s1').exec())?.toJSON() ?? null;

it('closes: the session, its closure from the session accounting, the live copy and the fact', async () => {
	await insert();
	await storeDB.cash_movements.insert({
		id: 'm1',
		session_id: 's1',
		type: 'paid_in',
		amount: '20',
		reason: '',
		created_by: 7,
		created_at_gmt: '2026-10-28T13:30:00.000Z',
		sync_status: 'pending',
		sync_attempts: 0,
	});
	await engineDB.collections.orders.insert(order(2, '2026-10-28T14:00:00', [payment({})]));
	await recordLiveSession(userDB, 'site', 'A', {
		session_id: 's1',
		status: 'counting',
		opened_at_gmt: row.opened_at_gmt,
		opened_by: { id: 8, name: 'Alex' },
		acknowledged: true,
		expected_float: null,
		counted_float: null,
		business_day: null,
	});
	const closure = await closeRegister(ctx, 's1', {
		counted: { cash: '125', stripe: '0' },
		note: 'Short',
		denominations: [{ value: '5', pieces: 25 }],
	});
	expect(await session()).toMatchObject({
		status: 'closed',
		pending_status: 'closed',
		sync_status: 'pending',
		closed_by: 7,
		closure_id: 's1',
	});
	expect(closure.toJSON()).toMatchObject({
		id: 's1',
		number: 1,
		till_expected: { cash: '130.0000' },
		counted: { cash: '125', stripe: '0' },
		variance: { cash: '-5.0000', stripe: '0.0000' },
		order_ids: ['order-2'],
		movement_ids: ['m1'],
		breakdowns: expect.objectContaining({
			register_name: 'Front',
			closed_by_name: 'Pat',
			opened_by_name: 'Alex',
			variance_note: 'Short',
		}),
	});
	expect(readLiveSession('site', 'A')).toBeNull();
	expect(logger.info).toHaveBeenCalledWith(
		'Register session closed',
		expect.objectContaining({
			actor,
			context: expect.objectContaining({
				type: 'register.session-closed',
				sessionId: 's1',
				registerId: 'A',
				closureId: 's1',
				counted: { cash: '125', stripe: '0' },
				variance: { cash: '-5.0000', stripe: '0.0000' },
			}),
		})
	);
});

// § 4.9 invariant 2: a close waits for its accounting. Without the wait the old sale's card refund
// is attributed to cash: the closure expects 80 cash and no card refund.
it('waits for a missing refund parent, then closes with the refund on its tender', async () => {
	await insert();
	await engineDB.collections.refunds.insert(refund);
	const require = engine.require;
	let arrive!: () => void;
	engine.require = (requirement: EngineRequirement) => {
		const handle = require(requirement);
		if (requirement.id !== 'register-session:refund-parents') return handle;
		return { ...handle, ready: new Promise((resolve) => (arrive = () => resolve(handle.ready))) };
	};
	const closing = closeRegister(ctx, 's1', { counted: { cash: '100' } });
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(engine.requireCalls).toContainEqual(
		expect.objectContaining({
			id: 'register-session:refund-parents',
			kind: 'targeted-records',
			collection: 'orders',
			remoteIds: ['1'],
		})
	);
	// The session is closed, but its closure waits for the parent.
	expect((await session()).status).toBe('closed');
	expect(await closureRow()).toBeNull();
	// A refresh stores a movement while the close waits: the closure records it.
	await storeDB.cash_movements.insert({
		id: 'late',
		session_id: 's1',
		type: 'paid_in',
		amount: '5',
		reason: '',
		created_by: 7,
		created_at_gmt: '2026-10-28T15:30:00.000Z',
		sync_status: 'synced',
		sync_attempts: 0,
	});
	await engineDB.collections.orders.insert(parent);
	arrive();
	const closure = await closing;
	expect(closure.till_expected).toEqual({ cash: '105.0000', stripe: '-20.0000' });
	expect(closure.movement_ids).toEqual(['late']);
	expect(engine.demandEvents).toContain('release:targeted-records');
});

it('closes with the accounting it has once the parent wait times out', async () => {
	jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
	try {
		await insert();
		await engineDB.collections.refunds.insert(refund);
		const require = engine.require;
		engine.require = (requirement: EngineRequirement) => ({
			...require(requirement),
			ready: new Promise(() => {}),
		});
		const closing = closeRegister(ctx, 's1', { counted: { cash: '80' } });
		await jest.advanceTimersByTimeAsync(15_000);
		const closure = await closing;
		expect(closure.till_expected).toEqual({ cash: '80.0000' });
		expect(logger.warn).toHaveBeenCalledWith(
			'Refund parent wait timed out; closing with available accounting'
		);
	} finally {
		jest.useRealTimers();
	}
});

describe('a refused close’s retry (#3304)', () => {
	// The store refused the first close: the session and its closure are both `failed`.
	const refusedClose = async () => {
		await insert();
		await closeRegister(ctx, 's1', { counted: { cash: '90' } });
		await (await storeDB.closures.findOne('s1').exec())!.incrementalPatch({
			sync_status: 'failed',
		});
		await (await storeDB.register_sessions.findOne('s1').exec())!.incrementalPatch({
			sync_status: 'failed',
		});
		jest.clearAllMocks();
	};

	it('rewrites the closure with the corrected count, then lets the outbox send both', async () => {
		await refusedClose();
		const closure = await closeRegister(ctx, 's1', { counted: { cash: '100' } });
		expect(closure.toJSON()).toMatchObject({
			counted: { cash: '100' },
			number: 1,
			sync_status: 'pending',
		});
		expect(await session()).toMatchObject({
			status: 'closed',
			pending_status: 'closed',
			sync_status: 'pending',
			counted: { cash: '100' },
		});
	});

	it('stays held (`failed`) when the closure cannot be rewritten', async () => {
		await refusedClose();
		// A register document without the reservation: the rewrite has nothing to revise.
		await remintRegister(userDB);
		await expect(closeRegister(ctx, 's1', { counted: { cash: '100' } })).rejects.toThrow(
			'closure_reservation_missing'
		);
		expect(await session()).toMatchObject({ status: 'closed', sync_status: 'failed' });
		expect((await closureRow())?.sync_status).toBe('failed');
		expect(logger.info).not.toHaveBeenCalledWith('Register session closed', expect.anything());
	});
});

it('rejects a missing session with the domain error', async () => {
	await expect(closeRegister(ctx, 'missing', { counted: { cash: '0' } })).rejects.toBeInstanceOf(
		RegisterSessionRequiredError
	);
});

describe('recovering a closure reservation a restart interrupted', () => {
	/** A close that reserved its closure (numbered, figures fixed) and stopped before the row. */
	const interrupted = async () => {
		await insert();
		const closure = await closeRegister(ctx, 's1', { counted: { cash: '100' } });
		const row = closure.toJSON();
		await closure.remove();
		// The reservation as the write left it: not yet applied to the register's totals.
		await userDB.upsertLocal('register', {
			...(await readRegister(userDB))!,
			sites: {
				site: {
					...(await readRegister(userDB))!.sites.site,
					registers: {
						A: { last_closure_number: 1, closure_reservation: { row, applied: false } },
					},
				},
			},
		});
		return row;
	};
	const register = async () => (await readRegister(userDB))!.sites.site.registers!.A;

	it('writes the reserved row as the closure and applies its period once', async () => {
		const row = await interrupted();
		await recoverClosureReservation(ctx, row);
		await recoverClosureReservation(ctx, row);
		expect(await closureRow()).toMatchObject({ ...row, sync_status: 'pending' });
		expect(await register()).toMatchObject({
			closure_reservation: { applied: true },
			perpetual_sales_total: row.perpetual_sales_total,
		});
	});

	it('keeps a closure row already written, and only applies its period', async () => {
		const row = await interrupted();
		await storeDB.closures.insert({ ...row, order_ids: [], movement_ids: [] });
		await recoverClosureReservation(ctx, { ...row, counted: { cash: '1' } });
		expect((await closureRow())?.counted).toEqual(row.counted);
		expect((await register()).closure_reservation?.applied).toBe(true);
	});

	it('leaves a reservation whose session this store does not hold', async () => {
		const row = await interrupted();
		await recoverClosureReservation(ctx, { ...row, id: 'other', session_id: 'other' });
		expect(await storeDB.closures.findOne('other').exec()).toBeNull();
		expect((await register()).closure_reservation?.applied).toBe(false);
	});
});
