/** @jest-environment node */
import { createRxDatabase } from 'rxdb';

import { engineSyncCollectionCreators } from '@wcpos/sync-engine/testing';

import { storages } from '../helpers/storages';
import { sqlitePlan } from '../helpers/sqlite-plan';

import type { RxDatabase } from 'rxdb';

describe.each(storages)('%s remote key lookups', (name, storage) => {
	let database: RxDatabase;
	afterEach(async () => {
		await database?.close();
	});
	it('returns the same server records as remoteId and uses an index', async () => {
		database = await createRxDatabase({
			name: `keys-${crypto.randomUUID()}`,
			storage,
			multiInstance: false,
		});
		await database.addCollections({ customers: engineSyncCollectionCreators().customers });
		await database.customers.bulkInsert(
			[null, '7', '8', '9'].map((remoteId, n) => ({
				uuid: `c${n}`,
				remoteId,
				remoteKey: remoteId ?? '',
				payload: {},
				sync: {},
				local: {},
			}))
		);
		const old = await database.customers
			.find({ selector: { remoteId: { $in: ['7', '9'] } } })
			.exec();
		const query = { selector: { remoteKey: { $in: ['7', '9'] } } };
		const indexed = await database.customers.find(query).exec();
		expect(indexed.map((doc) => doc.primary)).toEqual(['c1', 'c3']);
		expect(indexed.map((doc) => doc.primary)).toEqual(old.map((doc) => doc.primary));
		if (name === 'sqlite')
			expect(await sqlitePlan(database.customers, query)).not.toEqual(
				expect.arrayContaining([expect.stringMatching(/^SCAN (?!json_each)/)])
			);
	});
});
