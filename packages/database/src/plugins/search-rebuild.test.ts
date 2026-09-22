import {
	addRxPlugin,
	createRxDatabase,
	getAllCollectionDocuments,
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

it.each(['read', 'open'])(
	'rebuilds a persisted index after a destination %s failure without changing source documents',
	async (failure) => {
		const storage = getRxStorageMemory();
		const config = { name: `searchrecovery${failure}`, storage, multiInstance: false };
		database = await createRxDatabase(config);
		const { coupons } = await database.addCollections({ coupons: couponsConfig });
		await coupons.bulkInsert([
			{ id: 'coupon-1', name: 'Discount' },
			{ id: 'coupon-2', name: 'Voucher' },
		]);
		const first = (await coupons.initSearch!('en')) as unknown as SearchIndex;
		await first.pipeline.awaitIdle();
		await first.pipeline.close();
		await first.close();
		const before = (await coupons.find().exec()).map((doc) => doc.toJSON(true));
		await database.close();

		const createStorageInstance = storage.createStorageInstance.bind(storage);
		const readError = new SyntaxError("Expected ',' or ']' after array element in JSON");
		let failed = false;
		storage.createStorageInstance = async (params) => {
			if (params.collectionName.endsWith('_flexsearch') && !failed && failure === 'open') {
				failed = true;
				throw readError;
			}
			const instance = await createStorageInstance(params);
			if (params.collectionName.endsWith('_flexsearch') && !failed) {
				const query = instance.query.bind(instance);
				instance.query = async (prepared) => {
					if (!failed) {
						failed = true;
						throw readError;
					}
					return query(prepared);
				};
			}
			return instance;
		};
		database = await createRxDatabase(config);
		const { coupons: reopened } = await database.addCollections({ coupons: couponsConfig });
		// A source change makes the real pipeline consume the rejected initialization queue.
		await reopened.insert({ id: 'coupon-3', name: 'Rebate' });
		const sourceBefore = (await reopened.find().exec()).map((doc) => doc.toJSON(true));
		expect(sourceBefore.slice(0, 2)).toEqual(before);
		const rebuilt = (await reopened.initSearch!('en')) as unknown as SearchIndex;
		await rebuilt.pipeline.awaitIdle();
		expect(failed).toBe(true);
		expect((await rebuilt.find('discount')).map((doc) => doc.primary)).toEqual(['coupon-1']);
		expect((await rebuilt.find('voucher')).map((doc) => doc.primary)).toEqual(['coupon-2']);
		expect((await rebuilt.find('rebate')).map((doc) => doc.primary)).toEqual(['coupon-3']);
		expect((await reopened.find().exec()).map((doc) => doc.toJSON(true))).toEqual(sourceBefore);
		await rebuilt.pipeline.close();
		await rebuilt.close();
	}
);

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

it('a collection that now refuses an index drops its persisted index on reopen (Codex review)', async () => {
	// An upgraded till that ever searched its logs holds the index on disk; the
	// opt-out would otherwise strand it there forever (~7 KB a row).
	const config = {
		name: 'searchoptoutreclaim',
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
	const searchName = `${getSearchIdentifier('coupons', 'en')}_flexsearch`;
	const persistedBefore = (await getAllCollectionDocuments(database.internalStore)).map(
		(doc) => doc.data.name
	);
	expect(persistedBefore).toContain(searchName);
	await database.close();

	database = await createRxDatabase(config);
	const { coupons: reopened } = await database.addCollections({
		coupons: { ...couponsConfig, options: { ...couponsConfig.options, searchIndex: false } },
	});
	await expect(reopened.initSearch!('en')).resolves.toBeNull();
	// The hook fires without awaiting the removal; give it a few ticks.
	const persistedNames = async () =>
		(await getAllCollectionDocuments(database.internalStore)).map((doc) => doc.data.name);
	for (
		let attempt = 0;
		attempt < 50 && (await persistedNames()).includes(searchName);
		attempt += 1
	) {
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	expect(await persistedNames()).not.toContain(searchName);
	expect(logger.info).toHaveBeenCalledWith(expect.any(String), {
		context: { collection: 'coupons', removed: [searchName] },
	});
});

it('the divergence rebuild removes the registered destination before recreating it', async () => {
	database = await createRxDatabase({
		name: 'searchrecreatedivergence',
		storage: getRxStorageMemory(),
		multiInstance: false,
	});
	const { coupons } = await database.addCollections({ coupons: couponsConfig });
	await coupons.insert({ id: 'coupon-1', name: 'Discount' });
	const first = (await coupons.initSearch!('en')) as unknown as SearchIndex;
	await first.pipeline.awaitIdle();
	const searchName = `${getSearchIdentifier('coupons', 'en')}_flexsearch`;
	expect(database.collections[searchName]).toBe(first.collection);

	// recreateSearch is what the index-divergence handler calls. destroySearchCollection()
	// reaches the destination only through database.collections, so tearing the old instance
	// down must not deregister it first — otherwise the removal is a no-op and the corrupt
	// index and its pipeline checkpoint are reopened instead of rebuilt.
	const remove = jest.spyOn(first.collection, 'remove');
	const rebuilt = (await coupons.recreateSearch!('en')) as unknown as SearchIndex;
	await rebuilt.pipeline.awaitIdle();

	expect(remove).toHaveBeenCalledTimes(1);
	expect(rebuilt.collection).not.toBe(first.collection);
	expect(database.collections[searchName]).toBe(rebuilt.collection);
	// And the rebuild must carry the source rows: removing the storage without resetting the
	// pipeline checkpoint would leave the fresh index resuming after them, i.e. empty.
	expect((await rebuilt.find('discount')).map((doc) => doc.primary)).toEqual(['coupon-1']);
	await rebuilt.pipeline.close();
	await rebuilt.close();
});

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
