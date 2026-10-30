import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import type { StoreDatabase, UserDatabase } from '@wcpos/database';
import { registerSessionsLiteral } from '@wcpos/database/collections/schemas/register-sessions';
import { sitesLiteral } from '@wcpos/database/collections/schemas/sites';
import { wpCredentialsLiteral } from '@wcpos/database/collections/schemas/wp-credientials';

import { CarryAdoptionError, carryDrawer } from '../../src/register-session/carry';
import {
	bindRegister,
	readCarriedFrom,
	readClosedElsewhere,
	readLiveSession,
	readRegister,
	recordLiveSession,
	remintRegister,
} from '../../src/register-session/register-document';

addRxPlugin(RxDBLocalDocumentsPlugin);
let db: StoreDatabase;
let userDB: UserDatabase;
const http = { post: jest.fn(), get: jest.fn() };
const at = '2026-10-30T12:00:00Z';
const target = { store: { id: 2, name: 'Market' }, register: { id: 'B', name: 'Back' } };
const source = {
	id: 'source',
	register_id: 'A',
	status: 'open',
	opened_at_gmt: '2026-10-30T08:00:00Z',
	opened_by: 8,
	sync_status: 'synced',
	sync_attempts: 0,
	server_status: 'open',
};
beforeEach(async () => {
	http.post.mockReset();
	db = await createRxDatabase({
		name: `carry${Math.random().toString(36).slice(2)}`,
		storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
		multiInstance: false,
	});
	userDB = await createRxDatabase({
		name: `carryuser${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		multiInstance: false,
		localDocuments: true,
	});
	await db.addCollections({
		register_sessions: { schema: registerSessionsLiteral, autoMigrate: false },
	});
	await userDB.addCollections({
		sites: { schema: sitesLiteral, autoMigrate: false },
		wp_credentials: { schema: wpCredentialsLiteral, autoMigrate: false },
	});
	await userDB.wp_credentials.insert({ uuid: 'cashier', id: 7, display_name: 'Pat' });
	await userDB.sites.insert({ uuid: 'site', wp_credentials: ['cashier'] });
	await remintRegister(userDB);
	await bindRegister(userDB, 'site', { id: 'A', name: 'Front' }, 1);
	await db.register_sessions.insert(source as never);
	await recordLiveSession(userDB, 'site', 'A', {
		session_id: 'source',
		status: 'open',
		opened_at_gmt: source.opened_at_gmt,
		opened_by: { id: 8, name: 'Opener' },
		acknowledged: true,
		expected_float: '100',
		counted_float: '100',
		business_day: '2026-10-30',
	});
});
afterEach(async () => {
	await db.remove();
	await userDB.remove();
});
const carry = () =>
	carryDrawer({
		http,
		storeDB: db,
		userDB,
		siteUuid: 'site',
		sessionId: 'source',
		fromRegisterId: 'A',
		from: { id: 1, name: 'UK Store' },
		to: target,
		at,
	});

// Without the local close / count mark / target note the next switch or notice tells the wrong story.
it.each([false, true])(
	'closes here, records the target and binds only its store (blind=%s)',
	async (blind) => {
		http.post.mockImplementation(async (_url, body) => ({
			data: {
				closure: {
					id: body.closure_id,
					closed_at_gmt: at,
					closed_by: 7,
					...(blind ? {} : { expected: { cash: '125' }, counted: { cash: '125' } }),
				},
				session: {
					id: body.session_id,
					opened_at_gmt: at,
					opened_by: 7,
					business_day: '2026-10-30',
					...(blind ? {} : { expected_float: '125', counted_float: '125' }),
				},
			},
		}));
		const ids = await carry();
		expect(http.post).toHaveBeenCalledTimes(1);
		expect(http.post).toHaveBeenCalledWith('sessions/source/carry', {
			to_register_id: 'B',
			closure_id: ids.closureId,
			session_id: ids.sessionId,
			at,
		});
		for (const id of Object.values(ids)) expect(id).toMatch(/^[\da-f-]{36}$/);
		expect(ids.sessionId).not.toBe(ids.closureId);
		expect((await db.register_sessions.findOne('source').exec())?.toJSON()).toMatchObject({
			status: 'closed',
			server_status: 'closed',
			closure_id: ids.closureId,
			closed_at_gmt: at,
			closed_by: 7,
			sync_status: 'synced',
		});
		expect(readLiveSession('site', 'A')).toBeNull();
		expect(readClosedElsewhere('site', 'A')).toBeNull();
		expect(readLiveSession('site', 'B')).toMatchObject({
			session_id: ids.sessionId,
			status: 'open',
			opened_by: { id: 7, name: 'Pat' },
			acknowledged: true,
			expected_float: blind ? null : '125',
			counted_float: blind ? null : '125',
		});
		expect(readCarriedFrom('site', 'B', ids.sessionId)).toEqual({
			closure_id: ids.closureId,
			register_id: 'A',
			store_id: 1,
			store_name: 'UK Store',
		});
		expect((await readRegister(userDB))?.sites.site).toMatchObject({
			register_id: 'A',
			bindings: { '1': { register_id: 'A' }, '2': { register_id: 'B', register_name: 'Back' } },
		});
	}
);

// A rejected act must leave persisted rows and device metadata byte-for-byte unchanged.
it('a local write failing after the POST throws CarryAdoptionError with the carried ids', async () => {
	http.post.mockResolvedValue({
		data: {
			closure: { id: 'closure', closed_at_gmt: at, closed_by: 7 },
			session: { ...source, id: 'target', register_id: 'B', opened_at_gmt: at, opened_by: 7 },
		},
	});
	await db.register_sessions.findOne('source').remove();
	const error = await carry().catch((e) => e);
	expect(error).toBeInstanceOf(CarryAdoptionError);
	expect(error.carried).toEqual({ closureId: 'closure', sessionId: 'target' });
});

it.each([
	'wcpos_session_already_open',
	'wcpos_session_transition_refused',
	'wcpos_closure_session_invalid',
	'rest_invalid_param',
	'network',
])('changes nothing when POST rejects: %s', async (code) => {
	const before = {
		source: (await db.register_sessions.findOne('source').exec())?.toJSON(),
		register: await readRegister(userDB),
	};
	const error = new Error(code);
	http.post.mockRejectedValue(error);
	await expect(carry()).rejects.toBe(error);
	expect((await db.register_sessions.findOne('source').exec())?.toJSON()).toEqual(before.source);
	expect(await readRegister(userDB)).toEqual(before.register);
	expect(http.post).toHaveBeenCalledTimes(1);
});
