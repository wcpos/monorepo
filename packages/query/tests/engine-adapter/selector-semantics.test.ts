/** @jest-environment node */
import { createRxDatabase, normalizeMangoQuery, prepareQuery } from 'rxdb';

import { sortCompiledDocuments } from '../../src/engine-adapter/execute-query';
import { normalizeSelectorSemantics } from '../../src/engine-adapter/normalize-selector';
import { storages } from '../helpers/storages';

import type { EngineRxDocument } from '../../src/engine-adapter/execute-query';
import type { RxCollection, RxDatabase, RxJsonSchema } from 'rxdb';

type Probe = { uuid: string; value?: string | number | null };
const schema: RxJsonSchema<Probe> = {
	version: 0,
	primaryKey: 'uuid',
	type: 'object',
	properties: {
		uuid: { type: 'string', maxLength: 100 },
		value: { type: ['string', 'number', 'null'] },
	},
	required: ['uuid'],
};
const fixtures: Probe[] = [null, undefined, 'blue', 'red', 2, '2', 10, '10'].map((value, i) => ({
	uuid: `p${i}`,
	...(value === undefined ? {} : { value }),
}));

const sortedOrders = new Map<string, string[]>();
afterAll(() => {
	expect(sortedOrders.get('memory')).toEqual(sortedOrders.get('sqlite'));
});

describe.each(storages)('%s selector semantics', (name, storage) => {
	let database: RxDatabase;
	let collection: RxCollection<Probe>;
	beforeEach(async () => {
		database = await createRxDatabase({
			name: `semantics-${crypto.randomUUID()}`,
			storage,
			multiInstance: false,
		});
		({ probe: collection } = await database.addCollections({ probe: { schema } }));
		await collection.bulkInsert(fixtures);
	});
	afterEach(async () => {
		await database.close();
	});
	async function query(selector: Record<string, unknown>, sort = [{ uuid: 'asc' as const }]) {
		return (
			await collection.storageInstance.query(
				prepareQuery(
					collection.schema.jsonSchema,
					normalizeMangoQuery(collection.schema.jsonSchema, { selector, sort })
				)
			)
		).documents;
	}
	it.each([
		[{ $exists: false }, ['p0', 'p1']],
		[{ $exists: true }, ['p2', 'p3', 'p4', 'p5', 'p6', 'p7']],
		[{ $nin: ['blue', 2] }, ['p0', 'p1', 'p3', 'p5', 'p6', 'p7']],
	])('normalises the app selector %j before storage', async (condition, expected) => {
		expect(
			(await query(normalizeSelectorSemantics({ value: condition }))).map((row) => row.uuid)
		).toEqual(expected);
	});
	it('ties absent and null before values, then breaks ties by uuid', async () => {
		await collection.bulkRemove(fixtures.map((row) => row.uuid));
		await collection.bulkInsert([
			{ uuid: 's0', value: null },
			{ uuid: 's1' },
			{ uuid: 's2', value: 'a' },
			{ uuid: 's3', value: 'b' },
			{ uuid: 's4', value: 'c' },
		]);
		const rows = await query({ _deleted: false }, [{ value: 'asc' }]);
		if (name === 'sqlite') expect(rows.slice(0, 2).map((row) => row.uuid)).toEqual(['s0', 's1']);
		const sort = [
			{ direction: 'asc' as const, value: (row: Record<string, unknown>) => row.value },
		];
		const ids = (input: typeof rows) =>
			sortCompiledDocuments(input as unknown as EngineRxDocument[], sort).map((row) => row.uuid);
		// Both engines must produce this same JS order, independent of the storage's nullish order.
		sortedOrders.set(name, ids(rows));
		expect(ids(rows).slice(0, 2)).toEqual(['s0', 's1']);
		expect(ids(rows.slice(0, 2).reverse())).toEqual(['s0', 's1']);
	});
	it('isolates named databases and reads the mixed fixture', async () => {
		expect((await query({})).map((row) => row.uuid)).toEqual([
			'p0',
			'p1',
			'p2',
			'p3',
			'p4',
			'p5',
			'p6',
			'p7',
		]);
		const other = await createRxDatabase({
			name: `other-${crypto.randomUUID()}`,
			storage,
			multiInstance: false,
		});
		try {
			const { probe } = await other.addCollections({ probe: { schema } });
			expect(await probe.find().exec()).toEqual([]);
		} finally {
			await other.close();
		}
	});
	it.each([
		[{ $exists: false }, ['p1'], ['p0', 'p1']],
		[
			{ $exists: true },
			['p0', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'],
			['p2', 'p3', 'p4', 'p5', 'p6', 'p7'],
		],
		[{ $nin: ['blue', 2] }, ['p0', 'p1', 'p3', 'p5', 'p6', 'p7'], ['p3', 'p5', 'p6', 'p7']],
	])('pins the raw translator divergence: %j', async (condition, memory, sqlite) => {
		expect((await query({ value: condition })).map((row) => row.uuid)).toEqual(
			name === 'memory' ? memory : sqlite
		);
	});
});
