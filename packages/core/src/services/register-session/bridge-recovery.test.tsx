/** @jest-environment jsdom */
/**
 * #3289: a tab that died between `closeSession` and `writeClosure` left a closed session with a
 * recorded count, an unsent close and no closure. The bridge finishes that close at the next
 * start: the closure from the recorded count, then counting, closed and the closure, once each.
 */
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';

import * as React from 'react';

import { render, waitFor } from '@testing-library/react';
import { of } from 'rxjs';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import type { StoreDatabase, UserDatabase } from '@wcpos/database';
import {
	closeRegister,
	sessionRefreshRequests,
	setClosureReceiptSnapshot,
} from '@wcpos/query/register-session';
import { getLogger } from '@wcpos/utils/logger';
import { cashMovementsLiteral } from '@wcpos/database/collections/schemas/cash-movements';
import { closuresLiteral } from '@wcpos/database/collections/schemas/closures';
import { registerSessionsLiteral } from '@wcpos/database/collections/schemas/register-sessions';

import { RegisterSessionBridge } from './bridge';
import { remintRegister } from '../../../../query/src/register-session/register-document';
import { closeSession, openSession } from '../../../../query/src/register-session/session-store';
import { createEngineDatabase, createFakeEngine } from '../../../../query/src/testing';

Object.assign(globalThis, { TextEncoder });
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
addRxPlugin(RxDBLocalDocumentsPlugin);

const mockApp: Record<string, unknown> = {};
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: mockApp.engine }),
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));
jest.mock('../../contexts/app-state', () => {
	const session = () => mockApp.session;
	return { useStoreSession: session, useAppState: session };
});
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('../../screens/main/hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => mockApp.http,
}));
jest.mock('../register/use-register-binding', () => ({
	useRegisterBinding: () => ({ registerId: 'register', registerName: 'Front' }),
}));
jest.mock('../../hooks/use-store-day', () => ({ useStoreDay: () => ({ timezone: 'device' }) }));
// While `mockHold.on`, each accounting settle waits until the test releases it, or fails it.
const mockHold = { on: false, held: [] as ((error?: Error) => void)[] };
jest.mock('../../../../query/src/register-session/reads', () => {
	const actual = jest.requireActual('../../../../query/src/register-session/reads');
	return {
		...actual,
		settleSessionAccounting: async (...args: unknown[]) => {
			if (mockHold.on)
				await new Promise<void>((resolve, reject) =>
					mockHold.held.push((error) => (error ? reject(error) : resolve()))
				);
			return actual.settleSessionAccounting(...args);
		},
	};
});

const http = { post: jest.fn(), get: jest.fn() };
const dbs: { remove: () => Promise<unknown> }[] = [];
let userDB: UserDatabase;
let engineDB: RxDatabase;

async function storeDatabase() {
	const db = await createRxDatabase({
		name: `b3289${Math.random().toString(36).slice(2)}`,
		storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
		multiInstance: false,
	});
	await db.addCollections({
		closures: { schema: closuresLiteral, autoMigrate: false },
		register_sessions: { schema: registerSessionsLiteral, autoMigrate: false },
		cash_movements: { schema: cashMovementsLiteral, autoMigrate: false },
	});
	dbs.push(db);
	return db as unknown as StoreDatabase;
}

beforeEach(async () => {
	mockHold.on = false;
	mockHold.held.length = 0;
	http.post.mockReset();
	http.get.mockReset();
	userDB = (await createRxDatabase({
		name: `b3289user${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		localDocuments: true,
		multiInstance: false,
	})) as unknown as UserDatabase;
	dbs.push(userDB);
	await remintRegister(userDB);
	engineDB = await createEngineDatabase(['orders', 'refunds']);
	mockApp.engine = createFakeEngine(engineDB);
	mockApp.http = http;
	http.get.mockResolvedValue({ data: [] });
});
afterEach(async () => {
	for (const db of dbs.splice(0)) await db.remove();
	await engineDB.close();
});

/** Opens and closes locally, then "reloads": a fresh store database holding the persisted row. */
async function crashAfterCloseSession(acknowledged: Record<string, unknown> = {}, close = true) {
	const before = await storeDatabase();
	const opened = await openSession(before, {
		registerId: 'register',
		expectedFloat: null,
		countedFloat: '100',
		openedBy: 7,
		businessDay: { year: 2026, month: 11, day: 5 },
	});
	await opened.incrementalPatch({ server_status: 'open', sync_status: 'synced' });
	const counted = { cash: '96', card: '4' };
	const closed = close
		? await closeSession(before, opened.id, { counted, note: 'Till short' })
		: opened;
	if (Object.keys(acknowledged).length) await closed.incrementalPatch(acknowledged);
	const after = await storeDatabase();
	await after.register_sessions.insert(closed.getLatest().toMutableJSON());
	mockApp.session = {
		userDB,
		storeDB: after,
		site: { uuid: 'site', populate$: () => of([{ id: 7, display_name: 'Pat' }]) },
		store: { id: null, register_sessions: true },
		wpCredentials: { id: 7, display_name: 'Pat' },
	};
	// The store answers each status POST with the session at that status, and takes the closure.
	http.post.mockImplementation(async (url: string, body: Record<string, unknown>) => {
		if (url === 'closures') return { data: { ...body, findings: {} } };
		const local = (await after.register_sessions.findOne(opened.id).exec())!.toJSON();
		return { data: { ...local, status: body.status } };
	});
	return { storeDB: after, id: opened.id };
}

/** A refresh request runs one more full cycle (its refresh reads again), then the drain settles. */
async function secondCycle(storeDB: StoreDatabase, reads: number) {
	sessionRefreshRequests.next({ storeDB, registerId: 'register' });
	await waitFor(() => expect(http.get.mock.calls.length).toBeGreaterThan(reads), {
		timeout: 3000,
	});
	await new Promise((resolve) => setTimeout(resolve, 300));
}

/** The cashier's own close, as the close dialog runs it. */
const manualClose = (storeDB: StoreDatabase, id: string) =>
	closeRegister(
		{
			storeDB,
			userDB,
			siteUuid: 'site',
			actor: { id: '7', name: 'Pat' },
			engine: mockApp.engine as never,
			site: (mockApp.session as { site: never }).site,
			credentials: { id: 7, display_name: 'Pat' },
			timezone: 'device',
			registerName: 'Front',
		},
		id,
		{ counted: { cash: '96', card: '4' }, note: 'Till short' }
	);

const posts = () =>
	http.post.mock.calls.map(([url, body]) => [url, (body as { status?: string }).status ?? null]);

it('T2: at the next start, writes the closure from the recorded count and sends counting, closed, closure once each', async () => {
	const { storeDB, id } = await crashAfterCloseSession();
	expect(await storeDB.closures.findOne(id).exec()).toBeNull();

	const view = render(<RegisterSessionBridge />);
	await waitFor(
		async () => expect((await storeDB.closures.findOne(id).exec())?.sync_status).toBe('synced'),
		{ timeout: 3000 }
	);
	const closure = (await storeDB.closures.findOne(id).exec())!.toJSON();
	expect(closure).toMatchObject({ session_id: id, counted: { cash: '96', card: '4' } });
	expect((await storeDB.register_sessions.findOne(id).exec())!.toJSON()).toMatchObject({
		status: 'closed',
		server_status: 'closed',
		sync_status: 'synced',
		counted: { cash: '96', card: '4' },
		count_note: 'Till short',
	});
	// Another trigger sends nothing more: one status close and one closure, ever.
	await new Promise((resolve) => setTimeout(resolve, 300));
	view.unmount();
	expect(posts()).toEqual([
		[`sessions/${id}/status`, 'counting'],
		[`sessions/${id}/status`, 'closed'],
		['closures', null],
	]);
	expect(http.post.mock.calls[1][1]).toMatchObject({ counted: { cash: '96', card: '4' } });
});

it('T2b: a second full cycle sends nothing more and never rewrites the one closure', async () => {
	const { storeDB, id } = await crashAfterCloseSession();
	const view = render(<RegisterSessionBridge />);
	await waitFor(
		async () => expect((await storeDB.closures.findOne(id).exec())?.sync_status).toBe('synced'),
		{ timeout: 3000 }
	);
	await new Promise((resolve) => setTimeout(resolve, 300));
	const sent = http.post.mock.calls.length;
	const reads = http.get.mock.calls.length;
	const revision = (await storeDB.closures.findOne(id).exec())!.toJSON(true)._rev;

	await secondCycle(storeDB, reads);
	view.unmount();
	expect(http.post).toHaveBeenCalledTimes(sent);
	expect(sent).toBe(3);
	const closures = await storeDB.closures.find().exec();
	expect(closures.map((closure) => [closure.id, closure.toJSON(true)._rev])).toEqual([
		[id, revision],
	]);
});

it('leaves imported closed history alone: synced, no closure row here, nothing written or sent', async () => {
	const { storeDB, id } = await crashAfterCloseSession({
		server_status: 'closed',
		sync_status: 'synced',
		pending_status: null,
	});
	const view = render(<RegisterSessionBridge />);
	await waitFor(() => expect(http.get).toHaveBeenCalled(), { timeout: 3000 });
	await new Promise((resolve) => setTimeout(resolve, 300));
	await secondCycle(storeDB, http.get.mock.calls.length);
	view.unmount();
	expect(await storeDB.closures.findOne(id).exec()).toBeNull();
	expect(http.post).not.toHaveBeenCalled();
});

it('#3531: a cycle during a live close leaves it alone: one closure write, one closed fact, the receipt kept', async () => {
	const { storeDB, id } = await crashAfterCloseSession({}, false);
	const view = render(<RegisterSessionBridge />);
	await waitFor(() => expect(http.get).toHaveBeenCalled(), { timeout: 3000 });
	await new Promise((resolve) => setTimeout(resolve, 300));
	const info = jest.mocked(getLogger(['wcpos', 'registerSession'])).info;
	info.mockClear();

	// The cashier's close, held inside its accounting settle; a bridge cycle (the minute tick's) runs meanwhile.
	mockHold.on = true;
	const manual = manualClose(storeDB, id);
	await waitFor(() => expect(mockHold.held).toHaveLength(1), { timeout: 3000 });
	await secondCycle(storeDB, http.get.mock.calls.length);

	// The manual close finishes and the pane stores its receipt; then anything else held finishes.
	mockHold.on = false;
	mockHold.held.shift()!();
	const { closure } = await manual;
	await setClosureReceiptSnapshot(storeDB, closure.id, 'printed receipt');
	const written = (await storeDB.closures.findOne(id).exec())!.toJSON(true)._rev;
	for (const release of mockHold.held.splice(0)) release();
	// No further trigger: an outbox send is a closure write too, and only a recovery reruns one.
	await new Promise((resolve) => setTimeout(resolve, 500));
	view.unmount();

	const row = (await storeDB.closures.findOne(id).exec())!.toJSON(true);
	const closedFacts = info.mock.calls.filter(([message]) => message === 'Register session closed');
	expect({
		writes: row._rev.split('-')[0],
		receipt: row.receipt_snapshot,
		closedFacts: closedFacts.length,
	}).toEqual({ writes: written.split('-')[0], receipt: 'printed receipt', closedFacts: 1 });
});

it('#3531: a manual close during a recovery joins it: one closure write, one closed fact, the receipt kept', async () => {
	const { storeDB, id } = await crashAfterCloseSession({}, true);
	const info = jest.mocked(getLogger(['wcpos', 'registerSession'])).info;
	info.mockClear();

	// The bridge's first-cycle recovery, held inside its accounting settle; the cashier closes meanwhile.
	mockHold.on = true;
	const view = render(<RegisterSessionBridge />);
	await waitFor(() => expect(mockHold.held).toHaveLength(1), { timeout: 3000 });
	mockHold.on = false;
	// The pane stores the receipt the moment its own close returns.
	const manual = manualClose(storeDB, id).then(async (result) => {
		await setClosureReceiptSnapshot(storeDB, result.closure.id, 'printed receipt');
		return result;
	});
	await new Promise((resolve) => setTimeout(resolve, 50));

	// The recovery finishes; the joined manual close returns the same closure.
	mockHold.held.shift()!();
	const { closure } = await manual;
	await waitFor(
		async () => expect((await storeDB.closures.findOne(id).exec())?.sync_status).toBe('synced'),
		{ timeout: 3000 }
	);
	expect(closure.id).toBe((await storeDB.closures.findOne(id).exec())!.id);
	expect(mockHold.held).toHaveLength(0);
	const written = (await storeDB.closures.findOne(id).exec())!.toJSON(true)._rev;
	await secondCycle(storeDB, http.get.mock.calls.length);
	view.unmount();

	const row = (await storeDB.closures.findOne(id).exec())!.toJSON(true);
	const closedFacts = info.mock.calls.filter(([message]) => message === 'Register session closed');
	expect({
		writes: row._rev.split('-')[0],
		receipt: row.receipt_snapshot,
		closedFacts: closedFacts.length,
	}).toEqual({ writes: written.split('-')[0], receipt: 'printed receipt', closedFacts: 1 });
});

it('#3531: a manual close that fails is no longer in flight, so the bridge finishes it', async () => {
	const { storeDB, id } = await crashAfterCloseSession({}, false);
	const view = render(<RegisterSessionBridge />);
	await waitFor(() => expect(http.get).toHaveBeenCalled(), { timeout: 3000 });
	mockHold.on = true;
	const manual = manualClose(storeDB, id);
	await waitFor(() => expect(mockHold.held).toHaveLength(1), { timeout: 3000 });
	mockHold.on = false;
	mockHold.held.shift()!(new Error('accounting failed'));
	await expect(manual).rejects.toThrow('accounting failed');

	sessionRefreshRequests.next({ storeDB, registerId: 'register' });
	await waitFor(
		async () => expect((await storeDB.closures.findOne(id).exec())?.sync_status).toBe('synced'),
		{ timeout: 3000 }
	);
	view.unmount();
});
