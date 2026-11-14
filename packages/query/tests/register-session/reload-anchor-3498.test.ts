/**
 * #3498: float 0, pay in 1000, pay out 319.20, then reload the page before the close. The boot
 * cycle (drain, then refresh) adopts the server's anchor, which already counts both movements;
 * the till must not add them on top of it a second time. The fake server answers as
 * woocommerce-pos 2.0.1 does (client uuid echoed lowercase; expected = float + Σ paid_in −
 * Σ paid_out of non-voided rows; the detail's `movements` lists the same rows).
 */
import { filter, firstValueFrom, type Observable, timeout } from 'rxjs';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import type { StoreDatabase, UserDatabase } from '@wcpos/database';
import { closuresLiteral } from '@wcpos/database/collections/schemas/closures';
import { registerSessionsLiteral } from '@wcpos/database/collections/schemas/register-sessions';
import { cashMovementsLiteral } from '@wcpos/database/collections/schemas/cash-movements';
import { fromMinor, toMinor } from '@wcpos/order-math';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import {
	closeSession,
	openSession,
	recordMovement,
	writeClosure,
} from '../../src/register-session/session-store';
import { drainRegisterSessionQueue } from '../../src/register-session/queue';
import { refreshSessions } from '../../src/register-session/refresh';
import { baselineContains } from '../../src/register-session/baseline';
import { runRegisterSessionCycle } from '../../src/register-session/cycle';
import { observeRegisterDrawer, type RegisterDrawer } from '../../src/register-session/drawer';
import { remintRegister } from '../../src/register-session/register-document';
import { createEngineDatabase, createFakeEngine } from '../../src/testing';

addRxPlugin(RxDBLocalDocumentsPlugin);

type ServerMovement = {
	id: string;
	session_id: string;
	type: string;
	amount: string;
	reason: string;
	actor: number;
	voids: string | null;
	voided_by: string | null;
	created_at_gmt: string;
};
type Detail = Record<string, unknown> & { movements: ServerMovement[] };

let db: StoreDatabase;
let userDB: UserDatabase;
let engineDB: RxDatabase;
let engine: RxdbSyncEngine;
let server: {
	sessions: Map<string, Record<string, unknown>>;
	movements: ServerMovement[];
	/** A detail captured earlier, served instead of the live one (a snapshot taken mid-shift). */
	servedDetail: Detail | null;
};
const created: RxDatabase[] = [];

const four = (amount: string) => fromMinor(toMinor(amount, 4), 4);
const gmt = (at: number) => new Date(at).toISOString().slice(0, 19).replace('T', ' ');

function liveDetail(id: string): Detail {
	const session = server.sessions.get(id)!;
	const own = server.movements.filter((row) => row.session_id === id);
	let cash = toMinor(String(session.counted_float ?? '0'), 4);
	for (const row of own) {
		if (row.voided_by) continue;
		if (row.type === 'paid_in') cash += toMinor(row.amount, 4);
		if (row.type === 'paid_out') cash -= toMinor(row.amount, 4);
	}
	return {
		...session,
		movements: own.map((row) => ({ ...row })),
		expected: { cash: fromMinor(cash, 4) },
		sales_count: 0,
		order_ids: [],
		ledger_row_ids: [],
		refund_ids: [],
		// After every movement the server holds.
		as_of_gmt: gmt(Date.now() + 1000),
	};
}

const http = {
	post: jest.fn(async (url: string, input: unknown): Promise<{ data: unknown }> => {
		const body = input as Record<string, unknown>;
		if (url === 'sessions') {
			const row: Record<string, unknown> = {
				...body,
				id: String(body.id).toLowerCase(),
				opened_at_gmt: body.opened_at,
				status: 'open',
				counted_float: four(String(body.counted_float)),
			};
			delete row.opened_at;
			server.sessions.set(String(row.id), row);
			return { data: row };
		}
		if (url === 'movements') {
			const id = String(body.id).toLowerCase();
			const existing = server.movements.find((row) => row.id === id);
			if (existing) return { data: existing };
			const row: ServerMovement = {
				id,
				session_id: String(body.session_id).toLowerCase(),
				type: String(body.type),
				amount: four(String(body.amount)),
				reason: String(body.reason ?? ''),
				actor: 7,
				voids: (body.voids as string) ?? null,
				voided_by: null,
				created_at_gmt: String(body.created_at),
			};
			server.movements.push(row);
			return { data: row };
		}
		const status = url.match(/^sessions\/(.+)\/status$/);
		if (status) {
			const row: Record<string, unknown> = {
				...server.sessions.get(status[1])!,
				status: body.status,
			};
			if (body.counted) row.counted = body.counted;
			server.sessions.set(status[1], row);
			return { data: row };
		}
		throw new Error(`unexpected POST ${url}`);
	}),
	get: jest.fn(async (url: string): Promise<{ data: unknown }> => {
		if (url === 'sessions') return { data: [...server.sessions.values()] };
		const id = url.replace(/^sessions\//, '');
		return { data: server.servedDetail ?? liveDetail(id) };
	}),
};

async function storeDatabase() {
	const next = (await createRxDatabase({
		name: `r3498${Math.random().toString(36).slice(2)}`,
		storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
		multiInstance: false,
	})) as unknown as StoreDatabase;
	await next.addCollections({
		closures: { schema: closuresLiteral, autoMigrate: false },
		register_sessions: { schema: registerSessionsLiteral, autoMigrate: false },
		cash_movements: { schema: cashMovementsLiteral, autoMigrate: false },
	});
	created.push(next as unknown as RxDatabase);
	return next;
}

beforeEach(async () => {
	server = { sessions: new Map(), movements: [], servedDetail: null };
	http.post.mockClear();
	http.get.mockClear();
	db = await storeDatabase();
	userDB = (await createRxDatabase({
		name: `r3498user${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		localDocuments: true,
		multiInstance: false,
	})) as unknown as UserDatabase;
	await remintRegister(userDB);
	engineDB = await createEngineDatabase(['orders', 'refunds']);
	engine = createFakeEngine(engineDB);
});
afterEach(async () => {
	for (const each of created.splice(0)) await each.remove();
	await userDB.remove();
	await engineDB.close();
});

const drain = () =>
	drainRegisterSessionQueue({
		storeDB: db,
		userDB,
		siteUuid: 'site',
		engine: { active: () => null } as unknown as RxdbSyncEngine,
		http,
	});
const refresh = () => refreshSessions({ registerId: 'register', http, storeDB: db });
/** The boot path: recovery, seed, drain, then refresh, exactly as the bridge runs it. */
const boot = () =>
	runRegisterSessionCycle({
		storeDB: db,
		userDB,
		siteUuid: 'site',
		storeId: 0,
		registerId: 'register',
		online: true,
		engine: { active: () => null } as unknown as RxdbSyncEngine,
		http,
		actor: { id: '7', name: 'Cashier' },
	});
const payIn = (sessionId: string) =>
	recordMovement(db, { sessionId, type: 'paid_in', amount: '1000', reason: 'Bank', actor: 7 });
const payOut = (sessionId: string) =>
	recordMovement(db, {
		sessionId,
		type: 'paid_out',
		amount: '319.20',
		reason: 'Refund',
		actor: 7,
	});

async function open() {
	const session = await openSession(db, {
		registerId: 'register',
		expectedFloat: null,
		countedFloat: '0',
		openedBy: 7,
		businessDay: { year: 2026, month: 11, day: 10 },
	});
	await drain();
	return session;
}

/** The reload: a fresh store database holding exactly the rows the old one persisted. */
async function reload() {
	const sessions = (await db.register_sessions.find().exec()).map((row) => row.toJSON());
	const movements = (await db.cash_movements.find().exec()).map((row) => row.toJSON());
	const closures = (await db.closures.find().exec()).map((row) => row.toJSON());
	db = await storeDatabase();
	if (sessions.length) await db.register_sessions.bulkInsert(sessions as never);
	if (movements.length) await db.cash_movements.bulkInsert(movements as never);
	if (closures.length) await db.closures.bulkInsert(closures as never);
}

/** The drawer tile and count sheet's figure: the shared register drawer stream. */
async function tillExpected() {
	const snapshot = await firstValueFrom(
		(
			observeRegisterDrawer(
				{ storeDB: db, userDB, siteUuid: 'site', engine },
				'register'
			) as Observable<RegisterDrawer | null>
		).pipe(
			filter((value): value is RegisterDrawer => value !== null && value.session !== null),
			timeout(3000)
		)
	);
	return snapshot.expected.cash;
}

/**
 * Close and count 680.80 with the arguments `closeRegister` (close.ts:93-120) passes: the
 * closed session document, its latest document as the baseline, and the movement DOCUMENTS as
 * the query returns them, not plain copies.
 */
async function closureExpected(sessionId: string) {
	const closed = await closeSession(db, sessionId, { counted: { cash: '680.80' } });
	const movements = await db.cash_movements.find({ selector: { session_id: sessionId } }).exec();
	const closure = await writeClosure({
		storeDB: db,
		userDB,
		siteUuid: 'site',
		session: closed,
		baseline: { session: closed.getLatest(), refundSources: [] },
		counted: '680.80',
		otherTenders: {},
		movements,
		orders: [],
		revise: true,
	});
	return closure.till_expected.cash;
}

describe('#3498 a reload after the movements synced counts each of them once', () => {
	it('T1: both movements synced, then a reload; the boot cycle adopts the anchor', async () => {
		const session = await open();
		const paidIn = await payIn(session.id);
		await drain();
		const paidOut = await payOut(session.id);
		await drain();
		expect((await db.cash_movements.find().exec()).map((row) => [row.id, row.sync_status])).toEqual(
			expect.arrayContaining([
				[paidIn.id, 'synced'],
				[paidOut.id, 'synced'],
			])
		);
		await reload();
		await boot();
		const anchored = (await db.register_sessions.findOne(session.id).exec())!;
		expect(anchored.server_expected).toEqual({ cash: '680.8000' });
		expect([...(anchored.server_movement_ids ?? [])].sort()).toEqual(
			[paidIn.id, paidOut.id].sort()
		);
		// The membership holds for the rows the till reads (documents, as the drawer gets them):
		// the anchor and its membership agree, so a double count is the delta's, not the adopt's.
		const rows = await db.cash_movements.find().exec();
		const has = baselineContains([], [], rows, anchored)!;
		expect([has(paidIn.id), has(paidOut.id)]).toEqual([true, true]);
		expect({ till: await tillExpected(), closure: await closureExpected(session.id) }).toEqual({
			till: '680.8000',
			closure: '680.8000',
		});
	});

	it('T2: the anchor is taken after the paid-in only, and the paid-out syncs later', async () => {
		const session = await open();
		const paidIn = await payIn(session.id);
		await drain();
		// The snapshot the server served while only the paid-in was there.
		server.servedDetail = liveDetail(session.id);
		expect(server.servedDetail.expected).toEqual({ cash: '1000.0000' });
		await payOut(session.id);
		await reload();
		await boot();
		const anchored = (await db.register_sessions.findOne(session.id).exec())!;
		expect(anchored.server_expected).toEqual({ cash: '1000.0000' });
		expect(anchored.server_movement_ids).toEqual([paidIn.id]);
		expect(await tillExpected()).toBe('680.8000');
		// A later refresh serves the full snapshot.
		server.servedDetail = null;
		await refresh();
		expect({ till: await tillExpected(), closure: await closureExpected(session.id) }).toEqual({
			till: '680.8000',
			closure: '680.8000',
		});
	});
});

describe('#3498 no regression without a reload', () => {
	it('T3a: straight through, no refresh before the close', async () => {
		const session = await open();
		await payIn(session.id);
		await drain();
		await payOut(session.id);
		await drain();
		expect({ till: await tillExpected(), closure: await closureExpected(session.id) }).toEqual({
			till: '680.8000',
			closure: '680.8000',
		});
	});

	it('T3c: offline around the paid-out, then online', async () => {
		const session = await open();
		await payIn(session.id);
		await drain();
		await payOut(session.id);
		expect(await tillExpected()).toBe('680.8000');
		await drain();
		expect({ till: await tillExpected(), closure: await closureExpected(session.id) }).toEqual({
			till: '680.8000',
			closure: '680.8000',
		});
	});

	it('T3d: a refresh between the movements gives the same figure as no refresh', async () => {
		const session = await open();
		await payIn(session.id);
		await drain();
		await refresh();
		await payOut(session.id);
		await drain();
		await refresh();
		expect({ till: await tillExpected(), closure: await closureExpected(session.id) }).toEqual({
			till: '680.8000',
			closure: '680.8000',
		});
	});

	it('T3b: a movement truly unsynced is added on top of the anchor exactly once', async () => {
		const session = await open();
		await payIn(session.id);
		await drain();
		await refresh();
		const anchored = (await db.register_sessions.findOne(session.id).exec())!;
		expect(anchored.server_expected).toEqual({ cash: '1000.0000' });
		// Still pending, not in the served membership.
		const paidOut = await payOut(session.id);
		expect((await db.cash_movements.findOne(paidOut.id).exec())!.sync_status).toBe('pending');
		expect({ till: await tillExpected(), closure: await closureExpected(session.id) }).toEqual({
			till: '680.8000',
			closure: '680.8000',
		});
	});
});
