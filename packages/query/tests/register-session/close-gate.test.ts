/**
 * #3289: `closeRegister` makes the close sendable (`closeSession`) before its closure exists
 * (`writeClosure` runs after the accounting wait). The outbox must not POST the `closed` status
 * in that window: a tab that died there left the store with a closed session and no closure.
 */
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

import { type CloseContext, closeRegister } from '../../src/register-session/close';
import { drainRegisterSessionQueue } from '../../src/register-session/queue';
import { closeSession } from '../../src/register-session/session-store';
import { remintRegister } from '../../src/register-session/register-document';
import {
	createEngineDatabase,
	createFakeEngine,
	engineOrder,
	type FakeEngine,
} from '../../src/testing';

addRxPlugin(RxDBLocalDocumentsPlugin);

let storeDB: StoreDatabase;
let userDB: UserDatabase;
let engineDB: RxDatabase;
let engine: FakeEngine;
let ctx: CloseContext;
const http = { post: jest.fn(), get: jest.fn() };
const row = {
	id: 's1',
	register_id: 'A',
	status: 'counting' as const,
	server_status: 'counting' as const,
	opened_at_gmt: '2026-10-28T13:05:00.000Z',
	opened_by: 8,
	expected_float: '100.0000',
	counted_float: '100.0000',
	business_day: '2026-10-28',
	sync_status: 'synced' as const,
	sync_attempts: 0,
};
// A card refund stamped to this session whose parent order is not local: the close waits for it.
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
const site = {
	populate$: () => of([{ id: 8, display_name: 'Alex' }]),
} as unknown as CloseContext['site'];

beforeEach(async () => {
	http.post.mockReset();
	http.get.mockReset();
	storeDB = (await createRxDatabase({
		name: `gate${Math.random().toString(36).slice(2)}`,
		storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
		multiInstance: false,
	})) as unknown as StoreDatabase;
	userDB = (await createRxDatabase({
		name: `gateuser${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		localDocuments: true,
		multiInstance: false,
	})) as unknown as UserDatabase;
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
		actor: { id: '7', name: 'Pat' },
		engine,
		site,
		credentials: { id: 7, display_name: 'Pat' },
		timezone: 'device',
		registerName: 'Front',
	};
	// The store answers each status POST with the session at that status, and takes the closure.
	http.post.mockImplementation(async (url: string, body: Record<string, unknown>) => {
		if (url === 'closures') return { data: { ...body, findings: {} } };
		const local = (await storeDB.register_sessions.findOne('s1').exec())!.toJSON();
		return { data: { ...local, status: body.status } };
	});
});
afterEach(async () => {
	await storeDB.remove();
	await userDB.remove();
	await engineDB.close();
});

const insert = (patch: Partial<RegisterSessionRow> = {}) =>
	storeDB.register_sessions.insert({ ...row, ...patch });
const drain = () => drainRegisterSessionQueue({ storeDB, userDB, siteUuid: 'site', engine, http });
const urls = () => http.post.mock.calls.map(([url]) => url);
const statusPosts = () => http.post.mock.calls.filter(([url]) => url === 'sessions/s1/status');

it('T1: no closed status POST leaves while the closure is unwritten; once written, status then closure', async () => {
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
	// Inside the window: the close is recorded and pending, its closure is not written yet.
	const held = (await storeDB.register_sessions.findOne('s1').exec())!;
	expect(held.toJSON()).toMatchObject({
		status: 'closed',
		pending_status: 'closed',
		sync_status: 'pending',
	});
	expect(await storeDB.closures.findOne('s1').exec()).toBeNull();

	// A bridge tick or refresh drains now.
	await drain();
	expect(statusPosts()).toEqual([]);
	// Skipped, not attempted: no attempt, no backoff, no failure.
	expect(held.getLatest().toJSON()).toMatchObject({
		sync_status: 'pending',
		sync_attempts: 0,
		pending_status: 'closed',
		server_status: 'counting',
	});
	expect(held.getLatest().sync_next_at ?? null).toBeNull();

	await engineDB.collections.orders.insert(
		engineOrder({ uuid: 'order-1', id: 1, date_modified_gmt: '2026-10-01T10:00:00', meta_data: [] })
	);
	arrive();
	const { closure } = await closing;
	expect(closure.toJSON()).toMatchObject({ id: 's1', sync_status: 'pending' });

	await drain();
	expect(urls()).toEqual(['sessions/s1/status', 'closures']);
	expect(http.post.mock.calls[0][1]).toMatchObject({ status: 'closed', counted: { cash: '100' } });
	expect(held.getLatest().toJSON()).toMatchObject({
		server_status: 'closed',
		sync_status: 'synced',
	});
	expect((await storeDB.closures.findOne('s1').exec())!.sync_status).toBe('synced');
});

it('T4: a normal close sends exactly one status POST and one closure POST', async () => {
	await insert();
	await closeRegister(ctx, 's1', { counted: { cash: '100' } });
	await drain();
	await drain();
	expect(urls()).toEqual(['sessions/s1/status', 'closures']);
	expect(http.post.mock.calls[0][1]).toMatchObject({ status: 'closed', counted: { cash: '100' } });
	expect((await storeDB.closures.findOne('s1').exec())!.toJSON()).toMatchObject({
		sync_status: 'synced',
		counted: { cash: '100' },
	});
});

it('T1b: an open session counted straight to closed waits too, counting included', async () => {
	await insert({ status: 'open', server_status: 'open' });
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
	await drain();
	expect(statusPosts()).toEqual([]);
	await engineDB.collections.orders.insert(
		engineOrder({ uuid: 'order-1', id: 1, date_modified_gmt: '2026-10-01T10:00:00', meta_data: [] })
	);
	arrive();
	await closing;
	await drain();
	expect(urls()).toEqual(['sessions/s1/status', 'sessions/s1/status', 'closures']);
	expect(http.post.mock.calls.map(([, body]) => body.status ?? null)).toEqual([
		'counting',
		'closed',
		null,
	]);
});

it('holds the field row (closed, count recorded, no closure): no POST, the row untouched', async () => {
	await insert();
	await closeSession(storeDB, 's1', { counted: { cash: '100' } });
	const before = (await storeDB.register_sessions.findOne('s1').exec())!.toJSON(true);
	expect(before).toMatchObject({ pending_status: 'closed', sync_status: 'pending' });

	await drain();
	expect(http.post).not.toHaveBeenCalled();
	const after = (await storeDB.register_sessions.findOne('s1').exec())!.toJSON(true);
	expect(after).toEqual(before);
});
