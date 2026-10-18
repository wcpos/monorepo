/**
 * Regression coverage for #902 — logging in within ~1-2s of connecting a site
 * lost the site↔credential link and stranded the user on the connect screen.
 *
 * These run against a real RxDB (memory storage) with the app's own plugins and
 * site schema, because the bug lives in RxDB write semantics: `incrementalPatch`
 * replays a *precomputed* patch object on a revision conflict, so a snapshot read
 * before a conflicting write is written back verbatim afterwards.
 */
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { createRevision } from 'rxdb/plugins/utils';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import '@wcpos/database/plugins';
import { userCollections } from '@wcpos/database/collections';

import {
	linkCredentialsToSite,
	stripLocalOnlySiteFields,
	upsertSiteData,
} from '../../src/user-db/sites';
import {
	removeCredentials,
	removeSite,
	saveConnectedSite,
	saveLoginCredentials,
	SiteIdentityClashError,
} from '../../src/user-db';

jest.mock('uuid', () => ({
	v4: () => `uuid-${Math.random().toString(36).slice(2)}`,
}));

jest.setTimeout(30000);

const SITE_UUID = 'site-uuid-902';

const restResponse = (overrides: Record<string, unknown> = {}) => ({
	uuid: SITE_UUID,
	name: 'Pro WCPOS',
	url: 'https://example.test',
	wp_api_url: 'https://example.test/wp-json/',
	wc_api_url: 'https://example.test/wp-json/wc/v3/',
	wcpos_api_url: 'https://example.test/wp-json/wcpos/v2/',
	...overrides,
});

let db: RxDatabase<import('@wcpos/database').UserDatabase['collections']>;

const sites = () => db.collections.sites as never as import('@wcpos/database').SiteCollection;
const parse = (json: Record<string, unknown>) =>
	(
		db.collections.sites as unknown as {
			parseRestResponse: (j: unknown) => Record<string, unknown>;
		}
	).parseRestResponse(json);

beforeEach(async () => {
	db = await createRxDatabase({
		name: `site_writes_${Date.now()}_${Math.random().toString(36).slice(2)}`,
		storage: wrappedValidateZSchemaStorage({ storage: getRxStorageMemory() }),
		ignoreDuplicate: true,
	});
	await db.addCollections({
		users: userCollections.users,
		sites: userCollections.sites,
		wp_credentials: userCollections.wp_credentials,
		stores: userCollections.stores,
	});
});

afterEach(async () => {
	await db.close();
});

describe('parseRestResponse on a site payload', () => {
	it('fills wp_credentials with the schema default, so it must never be written back', () => {
		// This is the ammunition for the bug: the REST index never carries
		// wp_credentials, but the parsed payload always does.
		expect(parse(restResponse())).toHaveProperty('wp_credentials', []);
		expect(stripLocalOnlySiteFields(parse(restResponse()))).not.toHaveProperty('wp_credentials');
	});
});

describe('upsertSiteData with a raw embedded payload', () => {
	/**
	 * Regression for the 2026-08 embedded-boot brick: the WordPress template
	 * injects `initialProps.site` verbatim (no parseRestResponse on this path),
	 * and the server started sending fields the client schema didn't know.
	 * With `additionalProperties: false` + dev-only z-schema validation, every
	 * dev boot threw RxDB VD2 in PROCESS_INITIAL_PROPS, forever.
	 */
	const embeddedPayload = (overrides: Record<string, unknown> = {}) => ({
		...restResponse(),
		locale: 'en_US',
		some_future_server_field: 'boom',
		...overrides,
	});

	it('inserts despite unknown server fields, keeping known ones like locale', async () => {
		const doc = await upsertSiteData(db, embeddedPayload());

		expect(doc.uuid).toBe(SITE_UUID);
		expect(doc.locale).toBe('en_US');
		expect(doc.toJSON()).not.toHaveProperty('some_future_server_field');
	});

	it('merges into an existing document despite unknown server fields', async () => {
		await upsertSiteData(db, parse(restResponse()));
		const site = await sites().findOne(SITE_UUID).exec();
		await linkCredentialsToSite(site!, 'cred-1');

		const doc = await upsertSiteData(db, embeddedPayload({ name: 'Renamed' }));

		expect(doc.name).toBe('Renamed');
		expect(doc.locale).toBe('en_US');
		expect(doc.toJSON()).not.toHaveProperty('some_future_server_field');
		// The prune must not weaken the #902 guarantee.
		expect(doc.wp_credentials).toEqual(['cred-1']);
	});

	it('does not clobber a stored locale with the parser-synthesized empty string', async () => {
		// Embedded boot stores the real locale…
		await upsertSiteData(db, embeddedPayload());
		expect((await sites().findOne(SITE_UUID).exec())!.locale).toBe('en_US');

		// …then the standalone discovery flow re-connects the same site. The REST
		// index does not return `locale`, and `parseRestResponse` synthesizes the
		// schema default for every absent property (the #902 ammunition), so the
		// parsed payload carries `locale: ''`.
		const trailingDiscovery = parse(restResponse({ wp_version: '6.9' }));
		expect(trailingDiscovery).toHaveProperty('locale', '');

		await upsertSiteData(db, trailingDiscovery);

		const final = await sites().findOne(SITE_UUID).exec();
		expect(final!.locale).toBe('en_US');
		expect(final!.wp_version).toBe('6.9');
	});

	it('updates the stored locale when the server sends a real one', async () => {
		await upsertSiteData(db, embeddedPayload());

		await upsertSiteData(db, embeddedPayload({ locale: 'de_DE' }));

		expect((await sites().findOne(SITE_UUID).exec())!.locale).toBe('de_DE');
	});

	it('never writes local-only fields even when the payload carries them', async () => {
		await upsertSiteData(db, parse(restResponse()));
		const site = await sites().findOne(SITE_UUID).exec();
		await linkCredentialsToSite(site!, 'cred-1');

		const doc = await upsertSiteData(db, embeddedPayload({ wp_credentials: [] }));

		expect(doc.wp_credentials).toEqual(['cred-1']);
	});
});

describe('upsertSiteData', () => {
	it('creates the site document when it does not exist', async () => {
		const doc = await upsertSiteData(db, parse(restResponse()));

		expect(doc.uuid).toBe(SITE_UUID);
		expect(doc.name).toBe('Pro WCPOS');
	});

	it('preserves a credential linked between the connect read and the connect write', async () => {
		// 1. Connect saves the site.
		await upsertSiteData(db, parse(restResponse()));

		// 2. The connect flow's trailing discovery-details refresh parses its
		//    payload — the snapshot at this point has no credentials.
		const trailingPayload = parse(restResponse({ wp_version: '6.9', wc_version: '9.9.0' }));

		// 3. The user logs in while that refresh is still in flight.
		const site = await sites().findOne(SITE_UUID).exec();
		await linkCredentialsToSite(site!, 'cred-1');

		// 4. The trailing connect write lands last.
		await upsertSiteData(db, trailingPayload);

		const final = await sites().findOne(SITE_UUID).exec();
		expect(final!.wp_credentials).toEqual(['cred-1']);
		expect(final!.wp_version).toBe('6.9');
	});

	it('preserves the credential when the connect write and the login write are concurrent', async () => {
		await upsertSiteData(db, parse(restResponse()));
		const site = await sites().findOne(SITE_UUID).exec();
		const trailingPayload = parse(restResponse({ wp_version: '6.9' }));

		await Promise.all([
			linkCredentialsToSite(site!, 'cred-1'),
			upsertSiteData(db, trailingPayload),
		]);

		const final = await sites().findOne(SITE_UUID).exec();
		expect(final!.wp_credentials).toEqual(['cred-1']);
		expect(final!.wp_version).toBe('6.9');
	});

	it('revives a site the user removed and re-connected', async () => {
		await upsertSiteData(db, parse(restResponse()));
		const site = await sites().findOne(SITE_UUID).exec();
		await site!.getLatest().remove();
		expect(await sites().findOne(SITE_UUID).exec()).toBeNull();

		const revived = await upsertSiteData(db, parse(restResponse({ name: 'Pro WCPOS' })));

		expect(revived.deleted).toBe(false);
		const final = await sites().findOne(SITE_UUID).exec();
		expect(final).not.toBeNull();
		expect(final!.name).toBe('Pro WCPOS');
	});

	it('merges into the newest revision instead of replaying a stale snapshot', async () => {
		await upsertSiteData(db, parse(restResponse()));

		// Handle captured before any later write — this is what the connect
		// screen holds on to for the lifetime of the render.
		const staleSite = await sites().findOne(SITE_UUID).exec();
		await linkCredentialsToSite(staleSite!, 'cred-1');
		await linkCredentialsToSite(staleSite!, 'cred-2');

		await upsertSiteData(db, parse(restResponse({ name: 'Renamed' })));

		const final = await sites().findOne(SITE_UUID).exec();
		expect(final!.wp_credentials).toEqual(['cred-1', 'cred-2']);
		expect(final!.name).toBe('Renamed');
	});
});

describe('linkCredentialsToSite', () => {
	it('appends the credential uuid', async () => {
		await upsertSiteData(db, parse(restResponse()));
		const site = await sites().findOne(SITE_UUID).exec();

		await expect(linkCredentialsToSite(site!, 'cred-1')).resolves.toBe(true);

		const final = await sites().findOne(SITE_UUID).exec();
		expect(final!.wp_credentials).toEqual(['cred-1']);
	});

	it('keeps both links when two logins land in the same tick', async () => {
		await upsertSiteData(db, parse(restResponse()));
		const site = await sites().findOne(SITE_UUID).exec();

		await Promise.all([
			linkCredentialsToSite(site!, 'cred-1'),
			linkCredentialsToSite(site!, 'cred-2'),
		]);

		const final = await sites().findOne(SITE_UUID).exec();
		expect(final!.wp_credentials).toEqual(['cred-1', 'cred-2']);
	});

	it('does not duplicate the uuid when the same login is processed twice', async () => {
		await upsertSiteData(db, parse(restResponse()));
		const site = await sites().findOne(SITE_UUID).exec();

		const results = await Promise.all([
			linkCredentialsToSite(site!, 'cred-1'),
			linkCredentialsToSite(site!, 'cred-1'),
		]);

		const final = await sites().findOne(SITE_UUID).exec();
		expect(final!.wp_credentials).toEqual(['cred-1']);
		// Exactly one of the two actually wrote the link.
		expect(results.filter(Boolean)).toHaveLength(1);
	});

	it('recomputes the append against the DB document on a real revision conflict', async () => {
		// The other tests share one collection and therefore one incremental write
		// queue, which chains modifiers instead of hitting RxDB's 409 retry path.
		// This one lands a competing write underneath the queue so the append has
		// to survive an actual conflict — the semantics the whole fix rests on.
		await upsertSiteData(db, parse(restResponse()));
		const site = await sites().findOne(SITE_UUID).exec();

		const collection = sites() as never as {
			storageInstance: {
				bulkWrite: (
					rows: { previous: unknown; document: unknown }[],
					ctx: string
				) => Promise<never>;
			};
			database: { token: string };
		};
		const storageInstance = collection.storageInstance;
		const originalBulkWrite = storageInstance.bulkWrite.bind(storageInstance);
		let injected = false;

		storageInstance.bulkWrite = async (rows, ctx) => {
			if (!injected && ctx === 'incremental-write') {
				injected = true;
				const previous = rows[0].previous as Record<string, unknown>;
				const competing: Record<string, unknown> = {
					...previous,
					wp_credentials: ['cred-from-another-writer'],
					_meta: { lwt: Date.now() },
					_rev: createRevision(collection.database.token, previous as never),
				};
				await originalBulkWrite([{ previous, document: competing }], 'test-competing-write');
			}
			return originalBulkWrite(rows, ctx);
		};

		try {
			await linkCredentialsToSite(site!, 'cred-1');
		} finally {
			storageInstance.bulkWrite = originalBulkWrite;
		}

		expect(injected).toBe(true);
		const final = await sites().findOne(SITE_UUID).exec();
		expect(final!.wp_credentials).toEqual(['cred-from-another-writer', 'cred-1']);
	});

	it('refuses to link against a removed site instead of writing a tombstone', async () => {
		await upsertSiteData(db, parse(restResponse()));
		const site = await sites().findOne(SITE_UUID).exec();
		await site!.getLatest().remove();

		await expect(linkCredentialsToSite(site!, 'cred-1')).rejects.toThrow('removed site');
	});

	it('refuses to link when the site is removed during a revision-conflict retry', async () => {
		await upsertSiteData(db, parse(restResponse()));
		const site = await sites().findOne(SITE_UUID).exec();

		const collection = sites() as never as {
			storageInstance: {
				bulkWrite: (
					rows: { previous: unknown; document: unknown }[],
					ctx: string
				) => Promise<never>;
			};
			database: { token: string };
		};
		const storageInstance = collection.storageInstance;
		const originalBulkWrite = storageInstance.bulkWrite.bind(storageInstance);
		let injected = false;

		storageInstance.bulkWrite = async (rows, ctx) => {
			if (!injected && ctx === 'incremental-write') {
				injected = true;
				const previous = rows[0].previous as Record<string, unknown>;
				const tombstone: Record<string, unknown> = {
					...previous,
					_deleted: true,
					_meta: { lwt: Date.now() },
					_rev: createRevision(collection.database.token, previous as never),
				};
				await originalBulkWrite([{ previous, document: tombstone }], 'test-remove-site');
			}
			return originalBulkWrite(rows, ctx);
		};

		try {
			await expect(linkCredentialsToSite(site!, 'cred-1')).rejects.toThrow('removed site');
		} finally {
			storageInstance.bulkWrite = originalBulkWrite;
		}

		expect(injected).toBe(true);
	});

	it('reports false and skips the write when the credential is already linked', async () => {
		await upsertSiteData(db, parse(restResponse()));
		const site = await sites().findOne(SITE_UUID).exec();
		await linkCredentialsToSite(site!, 'cred-1');

		await expect(linkCredentialsToSite(site!, 'cred-1')).resolves.toBe(false);

		const final = await sites().findOne(SITE_UUID).exec();
		expect(final!.wp_credentials).toEqual(['cred-1']);
	});
});

it('rejects an absent user database', async () => {
	await expect(upsertSiteData(undefined, restResponse())).rejects.toMatchObject({
		name: 'UserDatabaseUnavailableError',
	});
});

describe('auth write commands', () => {
	const params = {
		uuid: 'cred-auth',
		id: '7',
		display_name: 'Cashier',
		access_token: 'token',
		refresh_token: 'refresh',
		expires_at: 123,
		token_type: 'Bearer',
	};
	const createUser = () => db.users.insert({ uuid: 'global-user', sites: [] });

	it('creates sanitized credentials and links once; re-auth patches tokens without losing stores', async () => {
		const site = await upsertSiteData(db, restResponse());
		const created = await saveLoginCredentials(db, SITE_UUID, params);
		expect(created).toMatchObject({ created: true, linked: true });
		expect(created.credentials.toJSON()).not.toHaveProperty('token_type');
		await db.wp_credentials
			.findOne(params.uuid)
			.exec()
			.then((doc) => doc!.incrementalPatch({ stores: ['saved-store'] }));
		const patched = await saveLoginCredentials(db, SITE_UUID, {
			...params,
			access_token: 'new-token',
		});
		expect(patched).toMatchObject({ created: false, linked: false });
		expect(patched.credentials.access_token).toBe('new-token');
		expect(patched.credentials.stores).toEqual(['saved-store']);
		expect(site.getLatest().wp_credentials).toEqual(['cred-auth']);
	});

	it('connects and merges the same identity without erasing credential links or duplicating the user link', async () => {
		const user = await createUser();
		const site = await saveConnectedSite(
			db,
			user,
			restResponse(),
			'https://example.test/wp-json/wcpos/v2/'
		);
		await linkCredentialsToSite((await sites().findOne(SITE_UUID).exec())!, 'cred-auth');
		await saveConnectedSite(
			db,
			user,
			restResponse({ name: 'Renamed', url: 'http://Example.test/' }),
			'http://Example.test/?rest_route=/wcpos/v2/'
		);
		expect(site.getLatest().name).toBe('Renamed');
		expect(site.getLatest().wp_credentials).toEqual(['cred-auth']);
		expect(user.getLatest().sites).toEqual([SITE_UUID]);
	});

	it.each(['home', 'reached'])(
		'refuses a cloned %s address before writing or linking',
		async (address) => {
			await upsertSiteData(db, restResponse());
			const user = await createUser();
			const data = restResponse(address === 'home' ? { url: 'https://clone.test' } : {});
			const reached = address === 'reached' ? 'https://clone.test/wp-json/' : data.wcpos_api_url;
			const saving = saveConnectedSite(db, user, data, reached);
			await expect(saving).rejects.toBeInstanceOf(SiteIdentityClashError);
			await expect(saving).rejects.toMatchObject({ existingName: 'Pro WCPOS' });
			expect((await sites().findOne(SITE_UUID).exec())!.url).toBe('https://example.test');
			expect(user.getLatest().sites).toEqual([]);
		}
	);

	it('removes a site then unlinks it from the user', async () => {
		const user = await createUser();
		await saveConnectedSite(db, user, restResponse(), restResponse().wcpos_api_url);
		await removeSite(user, SITE_UUID);
		expect(await sites().findOne(SITE_UUID).exec()).toBeNull();
		expect(user.getLatest().sites).toEqual([]);
	});

	it('removes credentials then unlinks them from the latest site', async () => {
		const site = await upsertSiteData(db, restResponse());
		await saveLoginCredentials(db, SITE_UUID, params);
		await removeCredentials(site, params.uuid);
		expect(await db.wp_credentials.findOne(params.uuid).exec()).toBeNull();
		expect(site.getLatest().wp_credentials).toEqual([]);
	});

	it.each(['', undefined])(
		'rejects empty/missing ids without changing existing auth records (%s)',
		async (id) => {
			const user = await createUser();
			const site = await upsertSiteData(db, restResponse());
			await saveLoginCredentials(db, SITE_UUID, params);
			await expect(saveLoginCredentials(db, id!, params)).rejects.toThrow();
			await expect(saveLoginCredentials(db, SITE_UUID, { ...params, uuid: id! })).rejects.toThrow();
			await expect(saveConnectedSite(db, user, restResponse({ uuid: id }), '')).rejects.toThrow();
			await expect(removeSite(user, id!)).rejects.toThrow();
			await expect(removeCredentials(site, id!)).rejects.toThrow();
			expect(site.getLatest().deleted).toBe(false);
			expect((await db.wp_credentials.findOne(params.uuid).exec())!.deleted).toBe(false);
		}
	);
});
