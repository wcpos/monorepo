// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';

import { memoryEngineStorage } from '../testing';
import { findAllUncached } from './find-all-uncached';

/**
 * #2502: a background full-collection read must not leave its RxQuery (and so every document it
 * returned) in the collection's query cache — unless a screen is subscribed to that same query.
 */

const itemSchema = {
	title: 'find-all-uncached test item',
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 64 },
		name: { type: 'string' },
	},
	required: ['id', 'name'],
} as const;

type Item = { id: string; name: string };

let dbSeq = 0;
const openDatabases: RxDatabase[] = [];

async function itemCollection(count: number): Promise<RxCollection<Item>> {
	const db = await createRxDatabase({
		name: `find-all-uncached-${(dbSeq += 1)}`,
		storage: memoryEngineStorage(),
		multiInstance: false,
	});
	openDatabases.push(db);
	await db.addCollections({ items: { schema: itemSchema } });
	const collection = db.collections.items as RxCollection<Item>;
	await collection.bulkInsert(
		Array.from({ length: count }, (_, index) => ({ id: `i-${index}`, name: `item ${index}` }))
	);
	return collection;
}

/** Cached queries that read the whole collection: `find` with an empty selector. */
function cachedFullFinds(collection: RxCollection<Item>): string[] {
	return [...collection._queryCache._map.values()]
		.filter(
			(query) => query.op === 'find' && Object.keys(query.mangoQuery.selector ?? {}).length === 0
		)
		.map((query) => query.toString());
}

afterEach(async () => {
	await Promise.all(openDatabases.splice(0).map((db) => db.close()));
});

describe('findAllUncached', () => {
	it('returns every document and leaves no full-collection query in the cache', async () => {
		const collection = await itemCollection(5);

		const docs = await findAllUncached(collection);

		expect(docs.map((doc) => doc.id).sort()).toEqual(['i-0', 'i-1', 'i-2', 'i-3', 'i-4']);
		expect(cachedFullFinds(collection)).toEqual([]);
	});

	it('keeps a query a screen is subscribed to, and the subscription stays live', async () => {
		const collection = await itemCollection(3);
		const subscribed = collection.find();
		const emissions: number[] = [];
		const subscription = subscribed.$.subscribe((docs) => emissions.push(docs.length));
		try {
			await expect.poll(() => emissions.at(-1)).toBe(3);

			const docs = await findAllUncached(collection);

			expect(docs).toHaveLength(3);
			expect([...collection._queryCache._map.values()]).toContain(subscribed);

			await collection.insert({ id: 'i-late', name: 'late' });
			await expect.poll(() => emissions.at(-1)).toBe(4);
		} finally {
			subscription.unsubscribe();
		}
	});

	it('leaves a newer equivalent query under the same key alone', async () => {
		const collection = await itemCollection(2);
		const original = collection.find();
		const key = original.toString();
		let newer: unknown;
		const exec = original.exec.bind(original);
		// While the read is in flight, the cache drops this instance and a newer equivalent
		// query takes its key (cache replacement, or an earlier equivalent read's cleanup).
		original.exec = (async () => {
			const docs = await exec();
			collection._queryCache._map.delete(key);
			newer = collection.find();
			return docs;
		}) as typeof original.exec;
		const fakeCollection = { find: () => original, _queryCache: collection._queryCache };

		await findAllUncached(fakeCollection);

		expect(newer).not.toBe(original);
		expect(collection._queryCache._map.get(key)).toBe(newer);
	});

	it('runs exec() on a plain fake that has no query cache', async () => {
		const a = { id: 'a' };
		const b = { id: 'b' };
		const fake = { find: () => ({ exec: async () => [a, b] }) };

		await expect(findAllUncached(fake)).resolves.toEqual([a, b]);
	});
});
