import { createUserDB } from '@wcpos/database/create-db';

import { settleRegister } from '../../src/register-session/register-document';
import {
	applyEmbeddedBootPayload,
	openUserDatabase,
	readSiteTransportInputs,
	recordSiteTransport,
} from '../../src/user-db';

jest.mock('../../src/register-session/register-document', () => ({
	...jest.requireActual('../../src/register-session/register-document'),
	settleRegister: jest.fn(),
}));
jest.mock('uuid', () => ({ v4: () => `uuid-${Math.random().toString(36).slice(2)}` }));
jest.mock('expo-crypto', () => ({
	CryptoDigestAlgorithm: { SHA256: 'SHA256' },
	CryptoEncoding: { HEX: 'HEX' },
	digestStringAsync: jest.fn(async () => '0123456789abcdef'),
}));

const documentLookup = (document: unknown) => ({
	findOne: jest.fn(() => ({ exec: jest.fn(async () => document) })),
});

beforeEach(() => jest.clearAllMocks());

describe('applyEmbeddedBootPayload', () => {
	it('leaves credential links unpatched when there is no store to select', async () => {
		const credentials = { uuid: 'cred-1', patch: jest.fn() };
		const userDB = {
			sites: {
				...documentLookup(null),
				schema: { primaryPath: 'uuid', jsonSchema: { properties: { uuid: {} } } },
				insert: async () => ({ uuid: 'site-1' }),
			},
			wp_credentials: {
				...documentLookup(null),
				schema: { primaryPath: 'uuid', jsonSchema: { properties: { uuid: {} } } },
				insert: async () => credentials,
			},
			stores: { bulkInsert: jest.fn() },
		};
		expect(
			await applyEmbeddedBootPayload(
				userDB as never,
				{ site: { uuid: 'site-1' }, wp_credentials: { uuid: 'cred-1' }, stores: [] },
				{
					uuid: 'user-1',
				} as never
			)
		).toMatchObject({ stores: [] });
		expect(credentials.patch).not.toHaveBeenCalled();
		expect(userDB.stores.bulkInsert).not.toHaveBeenCalled();
	});

	it('merges server-owned fields into existing stores and inserts new stores', async () => {
		const existingStore: any = {
			id: 1,
			localID: '0123456789',
			currency: 'USD',
			theme: 'dark',
			incrementalPatch: jest.fn(async (patch: Record<string, unknown>) => {
				Object.assign(existingStore, patch);
			}),
		};
		existingStore.getLatest = jest.fn(() => existingStore);

		const siteDoc = { uuid: 'site-1' };
		const wpCredentialsDoc = {
			uuid: 'credentials-1',
			patch: jest.fn(async () => undefined),
		};
		const bulkInsert = jest.fn(async () => undefined);
		const userDB = {
			sites: {
				schema: { primaryPath: 'uuid', jsonSchema: { properties: { uuid: {} } } },
				findOne: jest
					.fn()
					.mockReturnValueOnce({ exec: jest.fn(async () => null) })
					.mockReturnValue({ exec: jest.fn(async () => siteDoc) }),
				insert: jest.fn(async () => siteDoc),
			},
			wp_credentials: {
				schema: { primaryPath: 'uuid', jsonSchema: { properties: { uuid: {} } } },
				insert: jest.fn(async () => wpCredentialsDoc),
				...documentLookup(null),
			},
			stores: {
				findOne: jest
					.fn()
					.mockReturnValueOnce({ exec: jest.fn(async () => existingStore) })
					.mockReturnValueOnce({ exec: jest.fn(async () => null) })
					.mockReturnValue({ exec: jest.fn(async () => existingStore) }),
				bulkInsert,
			},
		};

		await applyEmbeddedBootPayload(
			userDB as any,
			{
				site: siteDoc,
				wp_credentials: wpCredentialsDoc,
				stores: [
					{ id: 1, currency: 'EUR', calc_taxes: 'yes', theme: 'light' },
					{ id: 2, name: 'New Store' },
				],
			},
			{ uuid: 'user-1' } as any
		);

		expect(userDB.sites.insert.mock.invocationCallOrder[0]).toBeLessThan(
			userDB.wp_credentials.insert.mock.invocationCallOrder[0]
		);
		expect(jest.requireMock('expo-crypto').digestStringAsync).toHaveBeenNthCalledWith(
			1,
			'SHA256',
			'{"user":"user-1","siteID":"site-1","wpCredentialsID":"credentials-1","storeID":1}',
			{ encoding: 'HEX' }
		);
		// calc_taxes is auto-synced; currency is app-editable and must NOT auto-sync
		expect(existingStore.incrementalPatch).toHaveBeenCalledWith({ calc_taxes: 'yes' });
		expect(existingStore.theme).toBe('dark');
		expect(bulkInsert).toHaveBeenCalledWith([
			expect.objectContaining({
				id: 2,
				name: 'New Store',
				prevent_overselling: false,
			}),
		]);
	});
});

describe('PROCESS_INITIAL_PROPS display advertisement', () => {
	it('keeps a display advertisement the initial props do not carry', async () => {
		// The free plugin builds inline initial props without Pro's store filters,
		// so `display` is never present there; the cashier response is the only
		// payload that may withdraw it.
		type StoreData = Record<string, unknown> & { display?: unknown };
		type StoreDouble = StoreData & {
			incrementalPatch: jest.Mock<Promise<void>, [Record<string, unknown>]>;
			incrementalModify: jest.Mock<Promise<void>, [(doc: StoreData) => StoreData]>;
			getLatest: () => StoreDouble;
		};
		const existingStore: StoreDouble = {
			id: 1,
			localID: '0123456789',
			display: { contract: 1, signaling: '/wcpos/v2/display' },
			incrementalPatch: jest.fn(async (patch: Record<string, unknown>) => {
				Object.assign(existingStore, patch);
			}),
			incrementalModify: jest.fn(async (modify: (doc: StoreData) => StoreData) => {
				const next = modify({ ...existingStore });
				delete existingStore.display;
				Object.assign(existingStore, next);
			}),
			getLatest: () => existingStore,
		};
		const siteDoc = { uuid: 'site-1' };
		const wpCredentialsDoc = { uuid: 'credentials-1', patch: jest.fn(async () => undefined) };
		const userDB = {
			sites: {
				schema: { primaryPath: 'uuid', jsonSchema: { properties: { uuid: {} } } },
				findOne: jest
					.fn()
					.mockReturnValueOnce({ exec: jest.fn(async () => null) })
					.mockReturnValue({ exec: jest.fn(async () => siteDoc) }),
				insert: jest.fn(async () => siteDoc),
			},
			wp_credentials: {
				...documentLookup(null),
				schema: { primaryPath: 'uuid', jsonSchema: { properties: { uuid: {} } } },
				insert: jest.fn(async () => wpCredentialsDoc),
			},
			stores: {
				findOne: jest.fn(() => ({ exec: jest.fn(async () => existingStore) })),
				bulkInsert: jest.fn(async () => undefined),
			},
		};
		await applyEmbeddedBootPayload(
			userDB as any,
			{
				site: siteDoc,
				wp_credentials: wpCredentialsDoc,
				stores: [{ id: 1, calc_taxes: 'yes' }],
			},
			{ uuid: 'user-1' } as any
		);
		expect(existingStore.display).toEqual({ contract: 1, signaling: '/wcpos/v2/display' });
		expect(existingStore.incrementalModify).not.toHaveBeenCalled();
	});
});

it('merges the embedded credential, so a failure before the stores patch keeps its links', async () => {
	// The payload carries no `stores`, `last_access` or `date_*`. A full-document
	// upsert reset them until the step's final patch, so a throw in between (the
	// step fails soft) persisted `stores: []` and the app showed no stores.
	const original = {
		uuid: 'credentials-1',
		display_name: 'Old Name',
		stores: ['store-a'],
		last_access: '2026-10-01T00:00:00.000Z',
		date_created_gmt: '2026-01-01T00:00:00',
		date_modified_gmt: '2026-09-01T00:00:00',
	};
	let stored: Record<string, unknown> = { ...original };
	type Modifier = (current: Record<string, unknown>) => Record<string, unknown>;
	const credentialDoc = {
		uuid: original.uuid,
		getLatest: () => credentialDoc,
		incrementalModify: jest.fn(async (modify: Modifier) => {
			stored = modify({ ...stored });
		}),
		patch: jest.fn(async (patch: Record<string, unknown>) => {
			stored = { ...stored, ...patch };
		}),
	};
	// RxDB's `upsert` replaces the document: omitted properties take their defaults.
	const upsert = jest.fn(async (json: Record<string, unknown>) => {
		stored = {
			stores: [],
			last_access: '',
			date_created_gmt: '',
			date_modified_gmt: '',
			...json,
		};
		return credentialDoc;
	});
	const credentialLookup = documentLookup(credentialDoc);
	const site = { uuid: 'site-1' };
	const context = {
		appState: { get: jest.fn(async () => null), set: jest.fn() },
		user: { uuid: 'user-1' },
		userDB: {
			sites: {
				...documentLookup(null),
				schema: { primaryPath: 'uuid', jsonSchema: { properties: { uuid: {} } } },
				insert: jest.fn(async () => site),
			},
			wp_credentials: { ...credentialLookup, upsert, incrementalUpsert: upsert, insert: upsert },
			stores: {
				...documentLookup(null),
				bulkInsert: jest.fn(async () => {
					throw new Error('store insert failed');
				}),
			},
		},
		initialProps: {
			site,
			wp_credentials: { uuid: original.uuid, display_name: 'New Name' },
			stores: [{ id: 1 }],
		},
	};
	await expect(
		applyEmbeddedBootPayload(context.userDB as never, context.initialProps, context.user as never)
	).rejects.toThrow('store insert failed');
	expect(stored).toEqual({ ...original, display_name: 'New Name' });
	expect(credentialLookup.findOne).toHaveBeenCalledWith('credentials-1');
	expect(upsert).not.toHaveBeenCalled();
});

it('does not link an embedded store rejected by schema validation', async () => {
	const { createRxDatabase } = await import('rxdb');
	const { getRxStorageMemory } = await import('rxdb/plugins/storage-memory');
	const { wrappedValidateZSchemaStorage } = await import('rxdb/plugins/validate-z-schema');
	await import('@wcpos/database/plugins');
	const { userCollections } = await import('@wcpos/database/collections');
	const db = await createRxDatabase({
		name: `embedded_${Date.now()}`,
		storage: wrappedValidateZSchemaStorage({ storage: getRxStorageMemory() }),
	});
	try {
		await db.addCollections({ stores: userCollections.stores });
		jest
			.requireMock('expo-crypto')
			.digestStringAsync.mockResolvedValueOnce('validstore000000')
			.mockResolvedValueOnce('badstore00000000');
		const credentials = {
			uuid: 'credentials-1',
			stores: [] as string[],
			patch: jest.fn(async (patch) => {
				Object.assign(credentials, patch);
			}),
		};
		const site = { uuid: 'site-1' };
		const bulkInsert = jest.spyOn(db.stores, 'bulkInsert');
		const applied = await applyEmbeddedBootPayload(
			{
				sites: {
					...documentLookup(null),
					schema: { primaryPath: 'uuid', jsonSchema: { properties: { uuid: {} } } },
					insert: async () => site,
				},
				wp_credentials: {
					...documentLookup(null),
					schema: { primaryPath: 'uuid', jsonSchema: { properties: { uuid: {} } } },
					insert: async () => credentials,
				},
				stores: db.stores,
			} as any,
			{
				site,
				wp_credentials: credentials,
				stores: [{ id: 1 }, { id: 2, name: 123 }],
			},
			{ uuid: 'user-1' } as any
		);
		const result = await bulkInsert.mock.results[0].value;
		expect(result.error).toEqual([
			expect.objectContaining({ status: 422, documentId: 'badstore00' }),
		]);
		expect(await db.stores.findOne('validstore').exec()).not.toBeNull();
		expect(await db.stores.findOne('badstore00').exec()).toBeNull();
		expect(credentials.stores).toEqual(['validstore']);
		// The rejected row is not a selection candidate either (Codex on #2718): offering it
		// would select a store that was never persisted and fail the boot.
		expect(applied.stores.map((store) => store.localID)).toEqual(['validstore']);
	} finally {
		await db.close();
	}
});

it('registers RxDB state support at module load, before opening the user database', () => {
	jest.isolateModules(() => {
		const { RxDatabaseBase } = jest.requireActual('rxdb');
		const withoutStatePlugin = RxDatabaseBase.prototype.addState;
		jest.requireActual('../../src/user-db/bootstrap');
		expect(RxDatabaseBase.prototype.addState).not.toBe(withoutStatePlugin);
	});
});

describe('openUserDatabase', () => {
	it.each([true, false])(
		'opens states, finds or inserts the global user, then settles the register (existing=%s)',
		async (existing) => {
			const order: string[] = [];
			const user = { uuid: 'global-user' };
			const sessionPointer = { get: jest.fn() };
			const translationsCache = { get: jest.fn() };
			const userDB = {
				addState: jest.fn(async (key: string) => {
					order.push(key);
					return key === 'v2' ? sessionPointer : translationsCache;
				}),
				users: {
					findOne: () => ({
						exec: async () => {
							order.push('find user');
							return existing ? user : null;
						},
					}),
					insert: jest.fn(async () => {
						order.push('insert user');
						return user;
					}),
				},
			};
			jest.mocked(createUserDB).mockImplementationOnce(async () => {
				order.push('open');
				return userDB as never;
			});
			jest.mocked(settleRegister).mockImplementationOnce(async (db) => {
				expect(db).toBe(userDB);
				order.push('settle register');
				return {} as never;
			});
			const result = await openUserDatabase();
			expect(order).toEqual([
				'open',
				'v2',
				'translations_v2',
				'find user',
				...(!existing ? ['insert user'] : []),
				'settle register',
			]);
			expect(settleRegister).toHaveBeenCalledTimes(1);
			expect(result.userDB).toBe(userDB);
			expect(result.user).toBe(user);
			expect(result.sessionPointer).toBe(sessionPointer);
			expect(result.translationsCache).toBe(translationsCache);
			if (!existing)
				expect(userDB.users.insert).toHaveBeenCalledWith({
					first_name: 'Global',
					last_name: 'User',
				});
		}
	);

	it('rejects when the database cannot open', async () => {
		jest.mocked(createUserDB).mockResolvedValueOnce(undefined);
		await expect(openUserDatabase()).rejects.toThrow('Failed to create user database');
	});
});

describe('site transport storage', () => {
	it('reads persisted probe inputs without losing the site identity', async () => {
		const userDB = {
			sites: documentLookup({
				uuid: 'site-1',
				wcpos_api_url: '/pos',
				wp_api_url: '/wp',
				wcpos_version: 'test',
			}),
			wp_credentials: documentLookup({ access_token: 'token' }),
		};
		expect(
			await readSiteTransportInputs(userDB as never, {
				siteID: 'site-1',
				wpCredentialsID: 'cred-1',
			})
		).toEqual({
			siteUuid: 'site-1',
			wcposApiUrl: '/pos',
			wpApiUrl: '/wp',
			wcposVersion: 'test',
			accessToken: 'token',
		});
		expect(userDB.sites.findOne).toHaveBeenCalledWith('site-1');
		expect(userDB.wp_credentials.findOne).toHaveBeenCalledWith('cred-1');
	});

	it('never looks up an empty site or credentials id', async () => {
		const userDB = {
			sites: documentLookup({ uuid: 'site-1', wp_api_url: 12 }),
			wp_credentials: documentLookup(null),
		};
		for (const pointer of [undefined, null, {}, { siteID: '' }]) {
			expect(await readSiteTransportInputs(userDB as never, pointer)).toEqual({});
		}
		await recordSiteTransport(userDB as never, '', {});
		expect(userDB.sites.findOne).not.toHaveBeenCalled();
		expect(await readSiteTransportInputs(userDB as never, { siteID: 'site-1' })).toMatchObject({
			wpApiUrl: undefined,
			accessToken: undefined,
		});
		expect(userDB.wp_credentials.findOne).not.toHaveBeenCalled();
	});

	it.each([true, false])(
		'writes every transport flag both ways on the latest site (%s)',
		async (flag) => {
			const latest = {
				use_jwt_as_param: !flag,
				use_rest_route_param: !flag,
				use_protocol_headers: !flag,
				use_instance_header: !flag,
				incrementalPatch: jest.fn(async (patch: Record<string, unknown>) => {
					Object.assign(latest, patch);
				}),
			};
			const userDB = { sites: documentLookup({ getLatest: () => latest }) };
			await recordSiteTransport(userDB as never, 'site-1', {
				useJwtAsParam: flag,
				useRestRouteParam: flag,
				useProtocolHeaders: flag,
				useInstanceHeader: flag,
			});
			expect(latest).toMatchObject({
				use_jwt_as_param: flag,
				use_rest_route_param: flag,
				use_protocol_headers: flag,
				use_instance_header: flag,
			});
			expect(latest.incrementalPatch).toHaveBeenCalledWith({
				use_jwt_as_param: flag,
				use_rest_route_param: flag,
				use_protocol_headers: flag,
				use_instance_header: flag,
			});
		}
	);
});
