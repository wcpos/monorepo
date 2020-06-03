import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { Database, Collection, appSchema, tableSchema } from '@nozbe/watermelondb';
import LineItem, { lineItemSchema } from './line-item';

const mockSchema = appSchema({
	version: 1,
	tables: [tableSchema(lineItemSchema)],
});

const adapter = new LokiJSAdapter({
	dbName: 'tests',
	schema: mockSchema,
});

const makeDatabase = ({ actionsEnabled = false } = {}) =>
	new Database({
		adapter,
		modelClasses: [LineItem],
		actionsEnabled,
	});

describe('Order Line Item Model', () => {
	let database: Database;
	let collection: Collection<UI>;

	beforeEach(() => {
		database = makeDatabase();
		collection = database.collections.get('line_items');
	});

	it('can instantiate new records', () => {
		// const database = makeDatabase();
		// const collection = database.collections.get('line_items');
		const model = new LineItem(collection, { name: 'Name', foo: 'bar' });
		expect(model).toBeInstanceOf(LineItem);
		expect(model.name).toBe('Name');
		expect(model.foo).toBeUndefined();
	});

	it('can create new records', async () => {
		// const database = makeDatabase();
		// const collection = database.collections.get('line_items');
		const model: LineItem = await database.action(async () => {
			const newModel = await collection.create((item) => {
				item.name = 'Name';
				item.foo = 'bar';
			});
			return newModel;
		});
		expect(model).toBeInstanceOf(LineItem);
		expect(model.name).toBe('Name');
		// expect(model.foo).toBeUndefined(); // note: model.foo = 'bar'
	});
});
