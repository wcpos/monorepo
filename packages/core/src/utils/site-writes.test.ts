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

		await Promise.all([
			linkCredentialsToSite(site!, 'cred-1'),
			linkCredentialsToSite(site!, 'cred-1'),
		]);

		const final = await sites().findOne(SITE_UUID).exec();
		expect(final!.wp_credentials).toEqual(['cred-1']);
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
