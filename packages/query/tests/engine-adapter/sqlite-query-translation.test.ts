/** @jest-environment node */
import { createRxDatabase, normalizeMangoQuery, prepareQuery } from 'rxdb';

import { buildScanSearchSelector, wooMetaCarrier } from '@wcpos/sync-core';

import { storages } from '../helpers/storages';

import type { RxDatabase, RxJsonSchema } from 'rxdb';

type Probe = {
	uuid: string;
	message?: string;
	context?: Record<string, string>;
	payload?: Record<string, unknown>;
};
const schema: RxJsonSchema<Probe> = {
	version: 0,
	primaryKey: 'uuid',
	type: 'object',
	properties: {
		uuid: { type: 'string', maxLength: 100 },
		message: { type: 'string' },
		context: { type: 'object', additionalProperties: true },
		payload: { type: 'object', additionalProperties: true },
	},
	required: ['uuid'],
};
const logs = (search: string) =>
	buildScanSearchSelector({
		foldedField: 'context.fold',
		rawFields: ['message', 'context.error', 'context.errorCode', 'context.search'],
		search,
	})!;
const rows: Probe[] = [
	{ uuid: 'fold', context: { fold: 'co-balt blue co%_*?[balt' } },
	{ uuid: 'raw', message: 'CO-BALT BLUE CO%_*?[BALT' },
	{ uuid: 'split', context: { fold: 'co-balt', error: 'BLUE' } },
	{ uuid: 'upper-fold', context: { fold: 'CO-BALT BLUE CO%_*?[BALT' } },
	{ uuid: 'neither', message: 'nothing' },
	{ uuid: 'regex', message: 'aXYZb' },
	{
		uuid: 'string',
		payload: { meta_data: [{ key: '_pos_user', value: '7' }], categories: [{ id: 5 }] },
	},
	{
		uuid: 'number',
		payload: { meta_data: [{ key: '_pos_user', value: 7 }], categories: [{ id: 6 }] },
	},
	{
		uuid: 'wrong',
		payload: {
			meta_data: [
				{ key: '_pos_user', value: '8' },
				{ key: 'other', value: '7' },
			],
			categories: [],
		},
	},
];
for (const [uuid, entry] of [
	['boolean', { value: true }],
	['missing', {}],
	['null', { value: null }],
	['one', { value: 1 }],
	['text', { value: 'z' }],
] as const)
	rows.push({ uuid, payload: { items: [entry] } });
const identity = wooMetaCarrier.identityFilter({ cashierId: '7' });
const cases: [string, Record<string, unknown>, string[], boolean][] = [
	['one-term Logs', logs('co-balt'), ['fold', 'raw', 'split'], true],
	['two-term Logs', logs('co-balt blue'), ['fold', 'raw', 'split'], true],
	['escaped punctuation Logs', logs('co%_*?[balt'), ['fold', 'raw'], true],
	[
		'carrier numeric identity',
		{ 'payload.meta_data': identity.meta_data },
		['number', 'string'],
		true,
	],
	[
		'user-sheet string identity',
		{ 'payload.meta_data': { $elemMatch: { key: '_pos_user', value: '7' } } },
		['string'],
		true,
	],
	['taxonomy', { 'payload.categories': { $elemMatch: { id: 5 } } }, ['string'], true],
	['unsupported regex', { message: { $regex: 'a.*b' } }, ['regex'], false],
];
for (const [label, condition, expected, fast] of [
	['nin fallback', { $nin: [1] }, ['boolean', 'missing', 'null', 'text'], false],
	['null in fallback', { $in: [null] }, ['missing', 'null'], false],
	['typed numeric equality', { $eq: 1 }, ['one'], true],
	['range fallback', { $gt: 1 }, [], false],
	['boolean equality fallback', { $eq: true }, ['boolean'], false],
] as [string, Record<string, unknown>, string[], boolean][]) {
	cases.push([label, { 'payload.items': { $elemMatch: { value: condition } } }, expected, fast]);
}
const results = new Map<string, unknown>();
afterAll(() => {
	for (const [label] of cases)
		expect(results.get(`sqlite:${label}`)).toEqual(results.get(`memory:${label}`));
});
describe.each(storages)('%s native translation', (name, storage) => {
	let database: RxDatabase;
	beforeEach(async () => {
		database = await createRxDatabase({
			name: `translation-${crypto.randomUUID()}`,
			storage,
			multiInstance: false,
		});
		await database.addCollections({ probe: { schema } });
		await database.probe.bulkInsert(rows);
	});
	afterEach(async () => {
		await database?.close();
	});
	it.each(cases)('%s returns matching rows and count', async (label, selector, expected, fast) => {
		const collection = database.probe;
		const prepared = prepareQuery(
			collection.schema.jsonSchema,
			normalizeMangoQuery(collection.schema.jsonSchema, { selector, sort: [{ uuid: 'asc' }] })
		);
		const ids = (await collection.storageInstance.query(prepared)).documents.map((doc) => doc.uuid);
		const count = await collection.storageInstance.count(prepared);
		expect(ids).toEqual(expected);
		expect(count.count).toBe(expected.length);
		results.set(`${name}:${label}`, { ids, count: count.count });
		if (name === 'sqlite') expect(count.mode).toBe(fast ? 'fast' : 'slow');
	});
	it('loads the installed translator patch', () => {
		expect(
			(globalThis as typeof globalThis & { WCPOS_SQLITE_QUERY_TRANSLATION_PATCH?: number })
				.WCPOS_SQLITE_QUERY_TRANSLATION_PATCH
		).toBe(1);
	});
});
