import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import type { StoreDatabase, UserDatabase } from '@wcpos/database';
import { registerSessionsLiteral } from '@wcpos/database/collections/schemas/register-sessions';
import { cashMovementsLiteral } from '@wcpos/database/collections/schemas/cash-movements';
import { closuresLiteral } from '@wcpos/database/collections/schemas/closures';

import { runRegisterSessionCycle } from '../../src/register-session/cycle';
import { seedSessionFromCache } from '../../src/register-session/seed';
import {
	type LiveSession,
	markCountingHere,
	readLiveSession,
	recordLiveSession,
	remintRegister,
} from '../../src/register-session/register-document';
import { registerCollections } from '../../src/register-session/store-database';

addRxPlugin(RxDBLocalDocumentsPlugin);
let storeDB: StoreDatabase;
let userDB: UserDatabase;
const http = { get: jest.fn(), post: jest.fn() };
const engine = { active: () => null };
const live: LiveSession = {
	session_id: 's1',
	status: 'open',
	opened_at_gmt: '2026-10-28T13:05:00Z',
	opened_by: { id: 7, name: 'Demo Cashier' },
	acknowledged: true,
	expected_float: '100.0000',
	counted_float: '100.0000',
	business_day: null,
	seeded_in: [],
	counting_here: false,
	at: '2026-10-28T13:05:00Z',
};
const existing = {
	id: 's1',
	register_id: 'A',
	status: 'open',
	opened_at_gmt: live.opened_at_gmt,
	sync_status: 'synced',
	counted_float: '123.0000',
};
beforeEach(async () => {
	jest.resetAllMocks();
	storeDB = await createRxDatabase({
		name: `cycle${Math.random().toString(36).slice(2)}`,
		storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
		multiInstance: false,
	});
	userDB = await createRxDatabase({
		name: `cycleuser${Math.random().toString(36).slice(2)}`,
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
});
afterEach(async () => {
	await storeDB.remove();
	await userDB.remove();
});
const cycle = (registerId = 'A', online = false) =>
	runRegisterSessionCycle({
		storeDB,
		userDB,
		siteUuid: 'site',
		storeId: 1,
		registerId,
		online,
		engine,
		http,
	});
it("offline, seeds the bound register's cached open session into a store database that has no row", async () => {
	await recordLiveSession(userDB, 'site', 'A', live);
	await cycle();
	const row = await registerCollections(storeDB).register_sessions.findOne('s1').exec();
	expect(row?.toJSON()).toMatchObject({
		status: 'open',
		register_id: 'A',
		store_id: 1,
		opened_by: 7,
		sync_status: 'synced',
		server_status: 'open',
		pending_status: null,
		counted_float: null,
		expected_float: null,
		business_day: '2026-10-28',
		opening_variance: null,
	});
	expect(http.get).not.toHaveBeenCalled();
	expect(http.post).not.toHaveBeenCalled();
});
it('seeds an opening the server has not acknowledged as a pending create with its floats and its business day', async () => {
	const pending = {
		...live,
		acknowledged: false,
		expected_float: '100.0000',
		counted_float: '100.0000',
		business_day: '2026-10-29',
		opened_at_gmt: '2026-10-28T23:30:00Z',
	};
	expect(await seedSessionFromCache(storeDB, pending, 'A', 1)).toBe('seeded');
	expect((await storeDB.register_sessions.findOne('s1').exec())?.toJSON()).toMatchObject({
		sync_status: 'pending',
		server_status: null,
		pending_status: 'open',
		expected_float: '100.0000',
		counted_float: '100.0000',
		business_day: '2026-10-29',
	});
});
it('does not resurrect a session the store database already holds as closed', async () => {
	await storeDB.register_sessions.insert({ ...existing, status: 'closed' });
	expect(await seedSessionFromCache(storeDB, live, 'A', 1)).toBe('closed');
	expect((await storeDB.register_sessions.findOne('s1').exec())?.status).toBe('closed');
});
it("seeds only the bound register's cache", async () => {
	await recordLiveSession(userDB, 'site', 'A', live);
	await cycle('B');
	expect(await storeDB.register_sessions.find().exec()).toHaveLength(0);
});
it('leaves an existing open row alone', async () => {
	const row = await storeDB.register_sessions.insert(existing);
	const before = row.toJSON();
	expect(await seedSessionFromCache(storeDB, live, 'A', 1)).toBe('present');
	expect(row.getLatest().toJSON()).toEqual(before);
});
it('a return hand-over into a database still holding the previous session closes it and seeds the new one', async () => {
	const { register_sessions: sessions } = registerCollections(storeDB);
	await sessions.insert({ ...existing, id: 'S', server_status: 'open' });
	await sessions.insert({ ...existing, id: 'C', status: 'counting', server_status: 'counting' });
	const pending = await sessions.insert({
		...existing,
		id: 'P',
		sync_status: 'pending',
		pending_status: 'open',
	});
	const other = await sessions.insert({ ...existing, id: 'B', register_id: 'B' });
	const pendingBefore = pending.toJSON();
	const otherBefore = other.toJSON();
	const liveT = { ...live, session_id: 'T' };
	await recordLiveSession(userDB, 'site', 'A', liveT);
	await cycle();
	for (const id of ['S', 'C']) {
		expect((await sessions.findOne(id).exec())?.toJSON()).toMatchObject({
			status: 'closed',
			server_status: 'closed',
			pending_status: null,
			closed_at_gmt: '2026-10-28T13:05:00Z',
			sync_status: 'synced',
		});
	}
	expect((await sessions.findOne('T').exec())?.toJSON()).toMatchObject({
		status: 'open',
		register_id: 'A',
		sync_status: 'synced',
		server_status: 'open',
	});
	expect(pending.getLatest().toJSON()).toEqual(pendingBefore);
	expect(other.getLatest().toJSON()).toEqual(otherBefore);
});
it('a cached session older than a synced active row neither seeds nor closes anything', async () => {
	const { register_sessions: sessions } = registerCollections(storeDB);
	const newer = await sessions.insert({
		...existing,
		id: 'N',
		opened_at_gmt: '2026-10-28T14:00:00Z',
		server_status: 'open',
	});
	const before = newer.toJSON();
	await recordLiveSession(userDB, 'site', 'A', { ...live, session_id: 'OLD' });
	await cycle();
	expect(newer.getLatest().toJSON()).toEqual(before);
	expect(await sessions.findOne('OLD').exec()).toBeNull();
	expect(readLiveSession('site', 'A')?.seeded_in).toEqual([]);
});
it('records on the device which store database the session was seeded into', async () => {
	await recordLiveSession(userDB, 'site', 'A', live);
	await cycle();
	expect(readLiveSession('site', 'A')?.seeded_in).toEqual([storeDB.name]);
	await cycle();
	expect(readLiveSession('site', 'A')?.seeded_in).toEqual([storeDB.name]);
});

it("online, after the refresh, records the register's active session on the device", async () => {
	const server = { ...existing, id: 's9', opened_by: 7, business_day: '2026-10-28' };
	http.get.mockResolvedValueOnce({ data: [server] }).mockResolvedValueOnce({ data: server });
	await cycle('A', true);
	expect(readLiveSession('site', 'A')).toMatchObject({
		session_id: 's9',
		status: 'open',
		acknowledged: true,
		counted_float: '123.0000',
		business_day: '2026-10-28',
	});
});
it("a refresh during this device's count keeps the counting mark", async () => {
	await recordLiveSession(userDB, 'site', 'A', { ...live, session_id: 's9', status: 'counting' });
	await markCountingHere(userDB, 'site', 'A', true);
	const server = {
		...existing,
		id: 's9',
		status: 'counting',
		opened_by: 7,
		counted_float: '123.0000',
	};
	http.get.mockResolvedValueOnce({ data: [server] }).mockResolvedValueOnce({ data: server });
	await cycle('A', true);
	expect(readLiveSession('site', 'A')).toMatchObject({
		status: 'counting',
		counting_here: true,
		counted_float: '123.0000',
		opened_by: { id: 7, name: 'Demo Cashier' },
	});
});
it('a refresh that brings the cached session back closed clears the cache', async () => {
	await recordLiveSession(userDB, 'site', 'A', { ...live, session_id: 's9' });
	http.get.mockResolvedValueOnce({
		data: [{ ...existing, id: 's9', status: 'closed', closed_at_gmt: new Date().toISOString() }],
	});
	await cycle('A', true);
	expect(readLiveSession('site', 'A')).toBeNull();
});
