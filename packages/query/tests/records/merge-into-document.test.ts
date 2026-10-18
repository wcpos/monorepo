import { createRxDatabase, type RxCollection, type RxDatabase, type RxJsonSchema } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { mergeIntoDocument, pruneToSchemaProperties } from '../../src/records/merge-into-document';

jest.setTimeout(30000);

type Row = { id: string; name?: string; note?: string; count?: number };

const schema: RxJsonSchema<Row> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	additionalProperties: false,
	properties: {
		id: { type: 'string', maxLength: 36 },
		name: { type: 'string' },
		note: { type: 'string' },
		count: { type: 'number' },
	},
	required: ['id'],
};

let db: RxDatabase<{ rows: RxCollection<Row> }>;
const rows = () => db.collections.rows;

beforeEach(async () => {
	db = await createRxDatabase({
		name: `merge_into_document_${Date.now()}_${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
	});
	await db.addCollections({ rows: { schema } });
});

afterEach(async () => {
	await db.close();
});

describe('mergeIntoDocument', () => {
	it('merges a narrower row over an existing document, keeping every omitted field', async () => {
		await rows().insert({ id: 'a', name: 'old', note: 'local', count: 3 });
		const merge = jest.fn((current: Row) => ({ ...current, name: 'new' }));
		const create = jest.fn(() => ({ id: 'a', name: 'new' }));

		const doc = await mergeIntoDocument(rows(), 'a', merge, create);

		expect(merge).toHaveBeenCalledWith(expect.objectContaining({ note: 'local', count: 3 }));
		expect(create).not.toHaveBeenCalled();
		expect(doc.toJSON()).toEqual({ id: 'a', name: 'new', note: 'local', count: 3 });
		const stored = await rows().findOne('a').exec();
		expect(doc).toBe(stored);
	});

	it('is the fix for what a raw incrementalUpsert does to the same document', async () => {
		await rows().insert({ id: 'a', name: 'old', note: 'local', count: 3 });
		await rows().incrementalUpsert({ id: 'a', name: 'new' });
		expect((await rows().findOne('a').exec())?.toJSON()).toEqual({ id: 'a', name: 'new' });
	});

	it('creates a missing document from create(), without calling merge', async () => {
		const merge = jest.fn((current: Row) => current);

		const doc = await mergeIntoDocument(rows(), 'b', merge, () => ({ id: 'b', name: 'fresh' }));

		expect(merge).not.toHaveBeenCalled();
		expect(doc.toJSON()).toEqual({ id: 'b', name: 'fresh' });
		expect((await rows().findOne('b').exec())?.name).toBe('fresh');
	});

	it('revives a removed document from create()', async () => {
		const removed = await rows().insert({ id: 'c', name: 'gone', note: 'stale' });
		await removed.remove();

		const doc = await mergeIntoDocument(
			rows(),
			'c',
			(current) => current,
			() => ({ id: 'c' })
		);

		expect(doc.toJSON()).toEqual({ id: 'c' });
		expect(doc.deleted).toBe(false);
	});
});

describe('pruneToSchemaProperties', () => {
	it('keeps declared keys and drops unknown and underscore-prefixed ones', () => {
		expect(
			pruneToSchemaProperties(rows(), {
				id: 'a',
				name: 'kept',
				created_at_gmt: '2026-10-18',
				movements: [],
				_deleted: false,
				_rev: '1-x',
			})
		).toEqual({ id: 'a', name: 'kept' });
	});
});
