import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import type { RegisterSessionRow, StoreDatabase, UserDatabase } from '@wcpos/database';
import { cashMovementsLiteral } from '@wcpos/database/collections/schemas/cash-movements';
import { closuresLiteral } from '@wcpos/database/collections/schemas/closures';
import { registerSessionsLiteral } from '@wcpos/database/collections/schemas/register-sessions';
import { getLogger } from '@wcpos/utils/logger';

import { abandonCount, beginCount, type CountContext } from '../../src/register-session/count';
import {
	readLiveSession,
	recordLiveSession,
	remintRegister,
} from '../../src/register-session/register-document';
import {
	IllegalSessionTransitionError,
	RegisterSessionRequiredError,
} from '../../src/register-session/session-store';

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
let ctx: CountContext;
const actor = { id: '7', name: 'Pat' };
const row = {
	id: 's1',
	register_id: 'A',
	status: 'open' as const,
	opened_at_gmt: '2026-10-28T13:05:00.000Z',
	opened_by: 7,
	expected_float: '90.0000',
	counted_float: '100.0000',
	business_day: '2026-10-28',
	sync_status: 'synced' as const,
	sync_attempts: 0,
};
beforeEach(async () => {
	jest.clearAllMocks();
	storeDB = await createRxDatabase({
		name: `count${Math.random().toString(36).slice(2)}`,
		storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
		multiInstance: false,
	});
	userDB = await createRxDatabase({
		name: `countuser${Math.random().toString(36).slice(2)}`,
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
	ctx = { storeDB, userDB, siteUuid: 'site', actor };
});
afterEach(async () => {
	await storeDB.remove();
	await userDB.remove();
});
const insert = (patch: Partial<RegisterSessionRow> = {}) =>
	storeDB.register_sessions.insert({ ...row, ...patch });
const live = () => readLiveSession('site', 'A');

it('begins a count: counting, pending, the live copy marked here, and the fact', async () => {
	await insert();
	const counted = await beginCount(ctx, 's1');
	expect(counted.toJSON()).toMatchObject({
		status: 'counting',
		pending_status: 'counting',
		sync_status: 'pending',
	});
	expect(live()).toMatchObject({
		session_id: 's1',
		status: 'counting',
		opened_at_gmt: row.opened_at_gmt,
		opened_by: { id: 7, name: 'Pat' },
		// The store had the row before the move made it pending.
		acknowledged: true,
		expected_float: '90.0000',
		counted_float: '100.0000',
		business_day: '2026-10-28',
		counting_here: true,
	});
	expect(logger.info).toHaveBeenCalledWith('Register session counting started', {
		actor,
		terminal: { operationId: expect.stringMatching(/^[0-9a-f]{32}$/) },
		context: { type: 'register.counting-started', sessionId: 's1', registerId: 'A' },
	});
});

it('abandons a count: open, the approval snapshot dropped, the live copy, and the fact', async () => {
	await insert({
		status: 'counting',
		approved_counted: { cash: '100' },
		approval_required: true,
		count_note: 'n',
	});
	const opened = await abandonCount(ctx, 's1');
	expect(opened.toJSON()).toMatchObject({
		status: 'open',
		pending_status: 'open',
		approved_counted: null,
		count_note: null,
		// The server's flag: it stays until the server clears it.
		approval_required: true,
	});
	expect(live()).toMatchObject({ status: 'open', counting_here: false, acknowledged: true });
	expect(logger.info).toHaveBeenCalledWith('Register session counting abandoned', {
		actor,
		terminal: { operationId: expect.stringMatching(/^[0-9a-f]{32}$/) },
		context: { type: 'register.counting-abandoned', sessionId: 's1', registerId: 'A' },
	});
});

it('abandons a close the store refused back to selling (#2016)', async () => {
	await insert({ status: 'closed', sync_status: 'failed', server_status: 'counting' });
	expect((await abandonCount(ctx, 's1')).status).toBe('open');
	expect(live()).toMatchObject({ status: 'open', acknowledged: true });
});

it.each([
	['the copy it already holds', { id: 7, name: 'Demo Cashier' }, 7, 'Demo Cashier'],
	['the signed-in user when they opened it', null, 7, 'Pat'],
	['nobody when another user opened it', null, 8, ''],
] as const)('names the opener from %s', async (_, held, openedBy, name) => {
	if (held)
		await recordLiveSession(userDB, 'site', 'A', {
			session_id: 's1',
			status: 'open',
			opened_at_gmt: row.opened_at_gmt,
			opened_by: held,
			acknowledged: true,
			expected_float: null,
			counted_float: null,
			business_day: null,
		});
	await insert({ opened_by: openedBy });
	await beginCount(ctx, 's1');
	expect(live()?.opened_by).toEqual({ id: openedBy, name });
});

it('a session the store has not acknowledged stays unacknowledged in the copy', async () => {
	await insert({ sync_status: 'pending' });
	await beginCount(ctx, 's1');
	expect(live()?.acknowledged).toBe(false);
});

it('keeps each count move a distinct audit attempt', async () => {
	await insert();
	await beginCount(ctx, 's1');
	await abandonCount(ctx, 's1');
	await beginCount(ctx, 's1');
	await abandonCount(ctx, 's1');
	const ids = logger.info.mock.calls.map(([, options]) => options?.terminal?.operationId);
	expect(ids).toHaveLength(4);
	expect(new Set(ids).size).toBe(4);
});

it.each([
	['beginCount', beginCount, 'closed'],
	['abandonCount', abandonCount, 'open'],
] as const)('%s refuses an illegal move and writes nothing', async (_, command, status) => {
	await insert({ status });
	await expect(command(ctx, 's1')).rejects.toBeInstanceOf(IllegalSessionTransitionError);
	expect((await storeDB.register_sessions.findOne('s1').exec())?.toJSON()).toMatchObject({
		status,
		sync_status: 'synced',
	});
	expect(live()).toBeNull();
	expect(logger.info).not.toHaveBeenCalled();
});

it.each([beginCount, abandonCount])(
	'%p rejects a missing session with the domain error',
	async (command) => {
		await expect(command(ctx, 'missing')).rejects.toBeInstanceOf(RegisterSessionRequiredError);
	}
);
