import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { Database, Collection, appSchema, tableSchema } from '@nozbe/watermelondb';
import Column, { uiColumnSchema } from './column';

const mockSchema = appSchema({
	version: 1,
	tables: [tableSchema(uiColumnSchema)],
});

const adapter = new LokiJSAdapter({
	dbName: 'tests',
	schema: mockSchema,
});

const makeDatabase = ({ actionsEnabled = false } = {}) =>
	new Database({
		adapter,
		modelClasses: [Column],
		actionsEnabled,
	});

describe('UI Model', () => {
	let database: Database;
	let collection: Collection<Column>;

	beforeEach(() => {
		database = makeDatabase();
		collection = database.collections.get('ui_columns');
	});

	it('can instantiate new records', () => {
		const model = new Column(collection, { key: 'name' });
		expect(model).toBeInstanceOf(Column);
		expect(model.key).toBe('name');
	});

	it('can create new records', async () => {
		const model: Column = await database.action(async () => {
			const newModel = await collection.create((column) => {
				column.key = 'name';
			});
			return newModel;
		});
		expect(model).toBeInstanceOf(Column);
		expect(model.key).toBe('name');
	});
});
