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

import { linkCredentialsToSite, stripLocalOnlySiteFields, upsertSiteData } from './site-writes';

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

let db: RxDatabase;

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
		const doc = await upsertSiteData(sites(), embeddedPayload());

		expect(doc.uuid).toBe(SITE_UUID);
		expect(doc.locale).toBe('en_US');
		expect(doc.toJSON()).not.toHaveProperty('some_future_server_field');
	});

	it('merges into an existing document despite unknown server fields', async () => {
		await upsertSiteData(sites(), parse(restResponse()));
		const site = await sites().findOne(SITE_UUID).exec();
		await linkCredentialsToSite(site!, 'cred-1');

		const doc = await upsertSiteData(sites(), embeddedPayload({ name: 'Renamed' }));

		expect(doc.name).toBe('Renamed');
		expect(doc.locale).toBe('en_US');
		expect(doc.toJSON()).not.toHaveProperty('some_future_server_field');
		// The prune must not weaken the #902 guarantee.
		expect(doc.wp_credentials).toEqual(['cred-1']);
	});

	it('never writes local-only fields even when the payload carries them', async () => {
		await upsertSiteData(sites(), parse(restResponse()));
		const site = await sites().findOne(SITE_UUID).exec();
		await linkCredentialsToSite(site!, 'cred-1');

		const doc = await upsertSiteData(sites(), embeddedPayload({ wp_credentials: [] }));

		expect(doc.wp_credentials).toEqual(['cred-1']);
	});
});

describe('upsertSiteData', () => {
	it('creates the site document when it does not exist', async () => {
		const doc = await upsertSiteData(sites(), parse(restResponse()));

		expect(doc.uuid).toBe(SITE_UUID);
		expect(doc.name).toBe('Pro WCPOS');
	});

	it('preserves a credential linked between the connect read and the connect write', async () => {
		// 1. Connect saves the site.
		await upsertSiteData(sites(), parse(restResponse()));

		// 2. The connect flow's trailing discovery-details refresh parses its
		//    payload — the snapshot at this point has no credentials.
		const trailingPayload = parse(restResponse({ wp_version: '6.9', wc_version: '9.9.0' }));

		// 3. The user logs in while that refresh is still in flight.
		const site = await sites().findOne(SITE_UUID).exec();
		await linkCredentialsToSite(site!, 'cred-1');

		// 4. The trailing connect write lands last.
		await upsertSiteData(sites(), trailingPayload);

		const final = await sites().findOne(SITE_UUID).exec();
		expect(final!.wp_credentials).toEqual(['cred-1']);
		expect(final!.wp_version).toBe('6.9');
	});

	it('preserves the credential when the connect write and the login write are concurrent', async () => {
		await upsertSiteData(sites(), parse(restResponse()));
		const site = await sites().findOne(SITE_UUID).exec();
		const trailingPayload = parse(restResponse({ wp_version: '6.9' }));

		await Promise.all([
			linkCredentialsToSite(site!, 'cred-1'),
			upsertSiteData(sites(), trailingPayload),
		]);

		const final = await sites().findOne(SITE_UUID).exec();
		expect(final!.wp_credentials).toEqual(['cred-1']);
		expect(final!.wp_version).toBe('6.9');
	});

	it('revives a site the user removed and re-connected', async () => {
		await upsertSiteData(sites(), parse(restResponse()));
		const site = await sites().findOne(SITE_UUID).exec();
		await site!.getLatest().remove();
		expect(await sites().findOne(SITE_UUID).exec()).toBeNull();

		const revived = await upsertSiteData(sites(), parse(restResponse({ name: 'Pro WCPOS' })));

		expect(revived.deleted).toBe(false);
		const final = await sites().findOne(SITE_UUID).exec();
		expect(final).not.toBeNull();
		expect(final!.name).toBe('Pro WCPOS');
	});

	it('merges into the newest revision instead of replaying a stale snapshot', async () => {
		await upsertSiteData(sites(), parse(restResponse()));

		// Handle captured before any later write — this is what the connect
		// screen holds on to for the lifetime of the render.
		const staleSite = await sites().findOne(SITE_UUID).exec();
		await linkCredentialsToSite(staleSite!, 'cred-1');
		await linkCredentialsToSite(staleSite!, 'cred-2');

		await upsertSiteData(sites(), parse(restResponse({ name: 'Renamed' })));

		const final = await sites().findOne(SITE_UUID).exec();
		expect(final!.wp_credentials).toEqual(['cred-1', 'cred-2']);
		expect(final!.name).toBe('Renamed');
	});
});

describe('linkCredentialsToSite', () => {
	it('appends the credential uuid', async () => {
		await upsertSiteData(sites(), parse(restResponse()));
		const site = await sites().findOne(SITE_UUID).exec();

		await expect(linkCredentialsToSite(site!, 'cred-1')).resolves.toBe(true);

		const final = await sites().findOne(SITE_UUID).exec();
		expect(final!.wp_credentials).toEqual(['cred-1']);
	});

	it('keeps both links when two logins land in the same tick', async () => {
		await upsertSiteData(sites(), parse(restResponse()));
		const site = await sites().findOne(SITE_UUID).exec();

		await Promise.all([
			linkCredentialsToSite(site!, 'cred-1'),
			linkCredentialsToSite(site!, 'cred-2'),
		]);

		const final = await sites().findOne(SITE_UUID).exec();
		expect(final!.wp_credentials).toEqual(['cred-1', 'cred-2']);
	});

	it('does not duplicate the uuid when the same login is processed twice', async () => {
		await upsertSiteData(sites(), parse(restResponse()));
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
		await upsertSiteData(sites(), parse(restResponse()));
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
		await upsertSiteData(sites(), parse(restResponse()));
		const site = await sites().findOne(SITE_UUID).exec();
		await site!.getLatest().remove();

		await expect(linkCredentialsToSite(site!, 'cred-1')).rejects.toThrow('removed site');
	});

	it('refuses to link when the site is removed during a revision-conflict retry', async () => {
		await upsertSiteData(sites(), parse(restResponse()));
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
		await upsertSiteData(sites(), parse(restResponse()));
		const site = await sites().findOne(SITE_UUID).exec();
		await linkCredentialsToSite(site!, 'cred-1');

		await expect(linkCredentialsToSite(site!, 'cred-1')).resolves.toBe(false);

		const final = await sites().findOne(SITE_UUID).exec();
		expect(final!.wp_credentials).toEqual(['cred-1']);
	});
});
