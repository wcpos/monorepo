import { waitFor } from '@testing-library/react';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';
import { BehaviorSubject, type Subscription, switchMap } from 'rxjs';

import '@wcpos/database/plugins';
import { userCollections } from '@wcpos/database/collections';

import {
	credentialsTokenOwner,
	migrateSiteApiUrl,
	observeCredentialStores,
	observeSiteCredentials,
	observeStoreByRemoteId,
	observeUserSites,
	PENDING_USER_DB_READ,
	readSiteApiUrls,
	recordCashierProfile,
	recordSiteInfo,
	SiteRemovedError,
} from '../../src/user-db';

jest.mock('uuid', () => ({ v4: () => `uuid-${Math.random().toString(36).slice(2)}` }));
let db: RxDatabase<import('@wcpos/database').UserDatabase['collections']>;
let subscription: Subscription;
beforeEach(async () => {
	db = await createRxDatabase({
		name: `auth_reads_${Math.random().toString(36).slice(2)}`,
		storage: wrappedValidateZSchemaStorage({ storage: getRxStorageMemory() }),
		ignoreDuplicate: true,
	});
	await db.addCollections(userCollections);
});
afterEach(async () => {
	subscription?.unsubscribe();
	await db.close();
});

it('keeps user site order and document identity, including after a link change', async () => {
	const a = await db.sites.insert({ uuid: 'a' });
	const b = await db.sites.insert({ uuid: 'b' });
	const user = await db.users.insert({ uuid: 'user', sites: ['b', 'a'] });
	const values: unknown[] = [];
	subscription = observeUserSites(user).subscribe((value) => values.push(value));
	expect(values).toEqual([PENDING_USER_DB_READ]);
	await waitFor(() =>
		expect((values.at(-1) as { uuid: string }[]).map((row) => row.uuid)).toEqual(['b', 'a'])
	);
	expect((values.at(-1) as unknown[])[0]).toBe(b);
	await user.incrementalPatch({ sites: ['a'] });
	await waitFor(() => expect(values.at(-1)).toHaveLength(1));
	expect((values.at(-1) as unknown[])[0]).toBe(a);
	expect(values.filter((value) => value === PENDING_USER_DB_READ)).toHaveLength(1);
});

it('resolves credentials without wrapping them and follows removal', async () => {
	const credential = await db.wp_credentials.insert({ uuid: 'cashier' });
	const site = await db.sites.insert({ uuid: 'site', wp_credentials: ['cashier'] });
	const values: unknown[] = [];
	subscription = observeSiteCredentials(site).subscribe((value) => values.push(value));
	expect(values).toEqual([PENDING_USER_DB_READ]);
	await waitFor(() => expect(values.at(-1)).toHaveLength(1));
	expect((values.at(-1) as unknown[])[0]).toBe(credential);
	await credential.remove();
	await waitFor(() => expect(values.at(-1)).toEqual([]));
	expect(values.filter((value) => value === PENDING_USER_DB_READ)).toHaveLength(1);
});

it('re-emits pending on every source binding, then resolves genuinely empty lists', async () => {
	const user = await db.users.insert({ uuid: 'user' });
	const site = await db.sites.insert({ uuid: 'site' });
	const credentials = await db.wp_credentials.insert({ uuid: 'cashier' });
	for (const read$ of [
		observeUserSites(user),
		observeSiteCredentials(site),
		observeCredentialStores(credentials),
	]) {
		const binding$ = new BehaviorSubject(read$);
		const values: unknown[] = [];
		subscription = binding$
			.pipe(switchMap((read) => read))
			.subscribe((value) => values.push(value));
		await waitFor(() => expect(values).toEqual([PENDING_USER_DB_READ, []]));
		binding$.next(read$);
		expect(values[2]).toBe(PENDING_USER_DB_READ);
		await waitFor(() =>
			expect(values).toEqual([PENDING_USER_DB_READ, [], PENDING_USER_DB_READ, []])
		);
		subscription.unsubscribe();
	}
});

it('observes late store inserts and clears the previous credentials on switch', async () => {
	const a = await db.wp_credentials.insert({ uuid: 'a', stores: ['late'] });
	const b = await db.wp_credentials.insert({ uuid: 'b', stores: ['other'] });
	const binding$ = new BehaviorSubject(a);
	const values: unknown[] = [];
	subscription = binding$
		.pipe(switchMap(observeCredentialStores))
		.subscribe((value) => values.push(value));
	expect(values).toEqual([PENDING_USER_DB_READ]);
	await waitFor(() => expect(values).toEqual([PENDING_USER_DB_READ, []]));
	const store = await db.stores.insert({ localID: 'late', id: 1, name: 'Late store' });
	await waitFor(() => expect(values.at(-1)).toHaveLength(1));
	expect((values.at(-1) as unknown[])[0]).toBe(store);
	expect(values.filter((value) => value === PENDING_USER_DB_READ)).toHaveLength(1);
	const switchIndex = values.length;
	binding$.next(b);
	expect(values.slice(switchIndex)).toEqual([PENDING_USER_DB_READ]);
	await waitFor(() => expect(values.slice(switchIndex)).toEqual([PENDING_USER_DB_READ, []]));
	await store.incrementalPatch({ name: 'Superseded' });
	const other = await db.stores.insert({ localID: 'other', id: 2 });
	await waitFor(() => expect(values.at(-1)).toHaveLength(1));
	expect((values.at(-1) as unknown[])[0]).toBe(other);
	expect(
		values
			.slice(switchIndex + 2)
			.every(
				(value) =>
					value !== PENDING_USER_DB_READ &&
					(value as { localID: string }[]).every((row) => row.localID !== 'late')
			)
	).toBe(true);
});

// These catch lost fields, undefined patches, stale token bindings and remote-id lookup drift.
it('records site info without erasing omitted license or search keys', async () => {
	const site = await db.sites.insert({
		uuid: 'site',
		wcpos_version: 'old',
		search_meta_keys: { products: ['sku'] },
	});
	await recordSiteInfo(site, { search_meta_keys: {} });
	expect(site.getLatest().wcpos_version).toBe('old');
	await recordSiteInfo(site, { wcpos_version: 'new' });
	expect(site.getLatest().wp_version).toBe('');
	expect(site.getLatest().search_meta_keys).toEqual({ products: ['sku'] });
	await recordSiteInfo(site, { wcpos_version: 'new', license: null, search_meta_keys: null });
	expect(site.getLatest().license).toEqual({});
	expect(site.getLatest().search_meta_keys).toEqual({});
	await site.getLatest().remove();
	await expect(recordSiteInfo(site, { wcpos_version: 'new' })).rejects.toBeInstanceOf(
		SiteRemovedError
	);
});

it('records cashier fields and clears omitted capabilities when merging stores', async () => {
	const credentials = await db.wp_credentials.insert({
		uuid: 'cashier',
		capabilities: ['edit_products'],
	});
	await recordCashierProfile(
		db,
		credentials,
		{ display_name: 'Cashier', role: 'cashier', stores: [] },
		{ userUuid: 'user', siteUuid: 'site' }
	);
	expect(credentials.getLatest().display_name).toBe('Cashier');
	expect(credentials.getLatest().roles).toEqual(['cashier']);
	expect(credentials.getLatest().toJSON()).not.toHaveProperty('capabilities');
	await recordCashierProfile(
		db,
		credentials,
		{ roles: ['', 'manager', 1], capabilities: ['read', '', 'read'] },
		{ userUuid: 'user', siteUuid: 'site' }
	);
	expect(credentials.getLatest().roles).toEqual(['manager']);
	expect(credentials.getLatest().capabilities).toEqual(['read']);
});

it('keeps token methods bound to the live credentials document', async () => {
	const credentials = await db.wp_credentials.insert({
		uuid: 'cashier',
		id: 7,
		refresh_token: 'refresh',
	});
	const { incrementalPatch, getLatest, id, refresh_token } = credentialsTokenOwner(credentials);
	expect({ id, refresh_token }).toEqual({ id: 7, refresh_token: 'refresh' });
	await incrementalPatch({ access_token: 'new', expires_at: 123 });
	expect(getLatest().access_token).toBe('new');
	await credentials.incrementalPatch({ refresh_token: 'rotated' });
	expect(getLatest().refresh_token).toBe('rotated');
});

it('migrates the API base and reads site URLs and stores by remote id', async () => {
	const site = await db.sites.insert({ uuid: 'site', wp_api_url: 'https://example.com/wp-json/' });
	await migrateSiteApiUrl(site, 'https://example.com/wp-json/wcpos/v2');
	expect(site.getLatest().wcpos_api_url).toBe('https://example.com/wp-json/wcpos/v2');
	expect(await readSiteApiUrls(db)).toEqual([
		{ uuid: 'site', wp_api_url: 'https://example.com/wp-json/' },
	]);
	const values: unknown[] = [];
	subscription = observeStoreByRemoteId(db, 7).subscribe((value) => values.push(value));
	await waitFor(() => expect(values).toEqual([undefined]));
	const store = await db.stores.insert({ localID: 'local', id: 7 });
	await waitFor(() => expect(values.at(-1)).toBe(store));
});
