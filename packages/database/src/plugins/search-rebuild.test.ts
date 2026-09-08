import {
	addRxPlugin,
	createRxDatabase,
	type RxCollection,
	RxCollectionBase,
	type RxDatabase,
	type RxDocument,
} from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { RxDBFlexSearchPlugin } from 'rxdb-premium/plugins/flexsearch';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { getLogger } from '@wcpos/utils/logger';

import { getSearchIdentifier, searchPlugin } from './search';

// The package ambient declaration omits the installed premium pipeline API.
type SearchIndex = {
	collection: RxCollection<{
		type: string;
		name: string;
		token: string;
		dataAr: { id: string; searchable: string }[];
	}>;
	pipeline: { awaitIdle(): Promise<void>; close(): Promise<void> };
	close(): Promise<void>;
	find(query: string): Promise<RxDocument<{ id: string; name: string }>[]>;
};

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: jest.fn(() => ({
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	})),
}));

const logger = jest.mocked(getLogger).mock.results[0].value;

setPremiumFlag();
addRxPlugin(RxDBFlexSearchPlugin);
addRxPlugin(searchPlugin);
let database: RxDatabase;
afterEach(async () => {
	await database?.close();
	jest.restoreAllMocks();
	jest.clearAllMocks();
});

const couponsConfig = {
	schema: {
		version: 0,
		primaryKey: 'id',
		type: 'object',
		properties: {
			id: { type: 'string', maxLength: 100 },
			name: { type: 'string' },
		},
		required: ['id', 'name'],
	},
	options: { searchFields: ['name'] },
};

it.each([false, true])(
	'reopens persisted storage and rebuilds only an oversized index (oversized=%s)',
	async (oversized) => {
		const config = {
			name: `searchrebuild${oversized}`,
			storage: getRxStorageMemory(),
			multiInstance: false,
		};
		database = await createRxDatabase(config);
		const { coupons } = await database.addCollections({ coupons: couponsConfig });
		await coupons.insert({ id: 'coupon-1', name: 'Discount' });
		const first = (await coupons.initSearch!('en')) as unknown as SearchIndex;
		await first.pipeline.awaitIdle();
		await first.pipeline.close();
		await first.close();
		if (oversized) {
			await first.collection.insert({
				type: 'append',
				name: 'duplicate',
				token: database.token,
				dataAr: [
					{ id: 'coupon-1', searchable: 'Discount' },
					{ id: 'coupon-1', searchable: 'Discount' },
				],
			});
		}
		await database.close();

		// A fresh app database has persisted appends and a checkpoint, but no search handle.
		database = await createRxDatabase(config);
		const { coupons: reopened } = await database.addCollections({ coupons: couponsConfig });
		const searchName = `${getSearchIdentifier('coupons', 'en')}_flexsearch`;
		expect(database.collections[searchName]).toBeUndefined();
		const remove = jest.spyOn(RxCollectionBase.prototype, 'remove');
		const addCollections = jest.spyOn(database, 'addCollections');
		const rebuilt = (await reopened.initSearch!('en')) as unknown as SearchIndex;
		await rebuilt.pipeline.awaitIdle();
		const appendDocs = await rebuilt.collection.find({ selector: { type: 'append' } }).exec();
		const entries = appendDocs.reduce((total, doc) => total + doc.dataAr.length, 0);
		expect(entries).toBe(await reopened.count().exec());
		expect(entries).toBe(1);
		expect(addCollections).toHaveBeenCalledTimes(oversized ? 2 : 1);
		if (oversized) {
			expect(remove).toHaveBeenCalledTimes(1);
			expect(logger.info).toHaveBeenCalledTimes(1);
			expect(logger.info).toHaveBeenCalledWith(expect.any(String), {
				context: {
					collection: 'coupons',
					locale: 'en',
					appendedEntries: 3,
					sourceCount: 1,
				},
			});
		} else {
			expect(remove).not.toHaveBeenCalled();
			expect(logger.info).not.toHaveBeenCalled();
		}
		expect((await rebuilt.find('discount')).map((doc) => doc.primary)).toEqual(['coupon-1']);
		await rebuilt.pipeline.close();
		await rebuilt.close();
	}
);

it('removes and rebuilds a registered healthy index after the source collection resets', async () => {
	database = await createRxDatabase({
		name: 'searchrebuildreset',
		storage: getRxStorageMemory(),
		multiInstance: false,
	});
	const { coupons } = await database.addCollections({ coupons: couponsConfig });
	await coupons.insert({ id: 'coupon-1', name: 'Discount' });
	const first = (await coupons.initSearch!('en')) as unknown as SearchIndex;
	await first.pipeline.awaitIdle();
	await first.pipeline.close();
	await first.close();
	await coupons.remove();
	const { coupons: reset } = await database.addCollections({ coupons: couponsConfig });
	await reset.insert({ id: 'coupon-2', name: 'Voucher' });
	expect(database.collections[first.collection.name]).toBe(first.collection);
	const remove = jest.spyOn(first.collection, 'remove');
	const addCollections = jest.spyOn(database, 'addCollections');
	const rebuilt = (await reset.initSearch!('en')) as unknown as SearchIndex;
	await rebuilt.pipeline.awaitIdle();
	expect(remove).toHaveBeenCalledTimes(1);
	expect(addCollections).toHaveBeenCalledTimes(1);
	expect(rebuilt.collection).not.toBe(first.collection);
	const appendDocs = await rebuilt.collection.find({ selector: { type: 'append' } }).exec();
	expect(appendDocs.flatMap((doc) => doc.dataAr.map((entry) => entry.id))).toEqual(['coupon-2']);
	expect(logger.info).not.toHaveBeenCalled();
	expect((await rebuilt.find('voucher')).map((doc) => doc.primary)).toEqual(['coupon-2']);
	expect(await rebuilt.find('discount')).toEqual([]);
	await rebuilt.pipeline.close();
	await rebuilt.close();
});
