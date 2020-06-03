import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { Database, Collection, appSchema, tableSchema } from '@nozbe/watermelondb';
import UI, { uiSchema } from './ui';

const mockSchema = appSchema({
	version: 1,
	tables: [tableSchema(uiSchema)],
});

const adapter = new LokiJSAdapter({
	dbName: 'tests',
	schema: mockSchema,
});

const makeDatabase = ({ actionsEnabled = false } = {}) =>
	new Database({
		adapter,
		modelClasses: [UI],
		actionsEnabled,
	});

describe('UI Model', () => {
	let database: Database;
	let collection: Collection<UI>;

	beforeEach(() => {
		database = makeDatabase();
		collection = database.collections.get('uis');
	});

	it('can instantiate new records', () => {
		const model = new UI(collection, { section: 'products' });
		expect(model).toBeInstanceOf(UI);
		expect(model.section).toBe('products');
	});

	it('can create new records', async () => {
		const model: UI = await database.action(async () => {
			const newModel = await collection.create((ui) => {
				ui.section = 'products';
			});
			return newModel;
		});
		expect(model).toBeInstanceOf(UI);
		expect(model.section).toBe('products');
	});
});
