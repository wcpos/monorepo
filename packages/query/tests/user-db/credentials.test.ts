import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import type { UserDatabase } from '@wcpos/database';
import '@wcpos/database/plugins';
import { userCollections } from '@wcpos/database/collections';

import { CashierIdentityClashError, saveLoginCredentials } from '../../src/user-db';
import { upsertSiteData } from '../../src/user-db/sites';

jest.mock('uuid', () => ({
	v4: () => `uuid-${Math.random().toString(36).slice(2)}`,
}));

jest.setTimeout(30000);

let db: UserDatabase;
const params = {
	uuid: 'cashier-uuid',
	id: '7',
	display_name: 'Ada',
	access_token: 'original-access',
	refresh_token: 'original-refresh',
	expires_at: 123,
};
const renewed = {
	...params,
	access_token: 'renewed-access',
	refresh_token: 'renewed-refresh',
	expires_at: 456,
};

beforeEach(async () => {
	db = await createRxDatabase({
		name: `credential_writes_${Date.now()}_${Math.random().toString(36).slice(2)}`,
		storage: wrappedValidateZSchemaStorage({ storage: getRxStorageMemory() }),
		ignoreDuplicate: true,
	});
	await db.addCollections({
		users: userCollections.users,
		sites: userCollections.sites,
		wp_credentials: userCollections.wp_credentials,
		stores: userCollections.stores,
	});
	await upsertSiteData(db, { uuid: 'site-a', name: 'Store A' });
	await upsertSiteData(db, { uuid: 'site-b', name: 'Store B' });
});

afterEach(async () => {
	await db.close();
});

describe('saveLoginCredentials', () => {
	it('refuses a cashier linked to another site without writing credentials or site links', async () => {
		await saveLoginCredentials(db, 'site-a', params);
		const credential = await db.wp_credentials.findOne(params.uuid).exec();
		const siteA = await db.sites.findOne('site-a').exec();
		const siteB = await db.sites.findOne('site-b').exec();
		const before = [credential!.toJSON(), siteA!.toJSON(), siteB!.toJSON()];

		const login = saveLoginCredentials(db, 'site-b', renewed);
		await expect(login).rejects.toBeInstanceOf(CashierIdentityClashError);
		await expect(login).rejects.toMatchObject({
			name: 'CashierIdentityClashError',
			existingName: 'Store A',
		});

		expect([
			credential!.getLatest().toJSON(),
			siteA!.getLatest().toJSON(),
			siteB!.getLatest().toJSON(),
		]).toEqual(before);
		expect(await db.wp_credentials.count().exec()).toBe(1);
	});

	it('still patches tokens when signing in again to the same site', async () => {
		await saveLoginCredentials(db, 'site-a', params);

		const result = await saveLoginCredentials(db, 'site-a', renewed);

		expect(result).toMatchObject({ created: false, linked: false });
		expect((await db.wp_credentials.findOne(params.uuid).exec())!.toJSON()).toMatchObject({
			access_token: 'renewed-access',
			refresh_token: 'renewed-refresh',
			expires_at: 456,
		});
		expect((await db.sites.findOne('site-a').exec())!.wp_credentials).toEqual([params.uuid]);
		expect((await db.sites.findOne('site-b').exec())!.wp_credentials).toEqual([]);
	});

	it('still inserts and links a new cashier identity', async () => {
		await saveLoginCredentials(db, 'site-a', params);

		const result = await saveLoginCredentials(db, 'site-b', { ...renewed, uuid: 'new-cashier' });

		expect(result).toMatchObject({ created: true, linked: true });
		expect((await db.wp_credentials.findOne('new-cashier').exec())!.toJSON()).toMatchObject({
			uuid: 'new-cashier',
			access_token: 'renewed-access',
			refresh_token: 'renewed-refresh',
			expires_at: 456,
		});
		expect((await db.sites.findOne('site-a').exec())!.wp_credentials).toEqual([params.uuid]);
		expect((await db.sites.findOne('site-b').exec())!.wp_credentials).toEqual(['new-cashier']);
		expect(await db.wp_credentials.count().exec()).toBe(2);
	});
});
