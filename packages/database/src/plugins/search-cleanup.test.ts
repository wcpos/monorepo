import {
	addRxPlugin,
	createRxDatabase,
	type RxCollection,
	type RxDatabase,
	type RxDocument,
} from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { RxDBFlexSearchPlugin } from 'rxdb-premium/plugins/flexsearch';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { getLogger } from '@wcpos/utils/logger';

import { searchPlugin } from './search';

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
	cleanup(): Promise<void>;
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

it("keeps every document's newest text after the plugin compacts its appends (#2501)", async () => {
	database = await createRxDatabase({
		name: 'searchcleanupcompaction',
		storage: getRxStorageMemory(),
		multiInstance: false,
	});
	const { coupons } = await database.addCollections({ coupons: couponsConfig });
	const search = (await coupons.initSearch!('en')) as unknown as SearchIndex;
	const ids = Array.from({ length: 20 }, (_, n) => `coupon-${n}`);
	const documents = [];
	for (const id of ids) {
		documents.push(await coupons.insert({ id, name: 'Guest' }));
		await search.pipeline.awaitIdle();
	}
	for (const [n, doc] of documents.entries()) {
		await doc.incrementalPatch({ name: `${32300 + n} Guest` });
		await search.pipeline.awaitIdle();
	}
	async function misses() {
		const missing = [];
		for (const [n, id] of ids.entries()) {
			const results = await search.find(String(32300 + n));
			if (!results.map((doc) => doc.primary).includes(id)) missing.push(id);
		}
		return missing;
	}
	expect(await misses()).toEqual([]);
	await search.cleanup();
	expect(await misses()).toEqual([]);
	await search.pipeline.close();
	await search.close();
});

it('replays leftover appends in write order on reopen (#2501)', async () => {
	const config = {
		name: 'searchcleanupreplay',
		storage: getRxStorageMemory(),
		multiInstance: false,
	};
	database = await createRxDatabase(config);
	const { coupons } = await database.addCollections({ coupons: couponsConfig });
	await coupons.bulkInsert(
		Array.from({ length: 20 }, (_, n) => ({ id: `coupon-${n}`, name: 'Guest' }))
	);
	const first = (await coupons.initSearch!('en')) as unknown as SearchIndex;
	await first.pipeline.awaitIdle();
	await first.cleanup();
	await first.pipeline.close();
	await first.close();
	await first.collection.insert({
		type: 'append',
		name: 'zzzz-older',
		token: database.token,
		dataAr: [{ id: 'coupon-0', searchable: 'Guest' }],
	});
	await first.collection.insert({
		type: 'append',
		name: 'aaaa-newer',
		token: database.token,
		dataAr: [{ id: 'coupon-0', searchable: '32300 Guest' }],
	});
	await database.close();

	database = await createRxDatabase(config);
	const { coupons: reopened } = await database.addCollections({ coupons: couponsConfig });
	const rebuilt = (await reopened.initSearch!('en')) as unknown as SearchIndex;
	await rebuilt.pipeline.awaitIdle();
	expect(logger.info).not.toHaveBeenCalled();
	expect((await rebuilt.find('32300')).map((doc) => doc.primary)).toEqual(['coupon-0']);
	await rebuilt.pipeline.close();
	await rebuilt.close();
});
