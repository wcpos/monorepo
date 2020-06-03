import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { Database, Collection, appSchema, tableSchema } from '@nozbe/watermelondb';
import Display, { uiDisplaySchema } from './display';

const mockSchema = appSchema({
	version: 1,
	tables: [tableSchema(uiDisplaySchema)],
});

const adapter = new LokiJSAdapter({
	dbName: 'tests',
	schema: mockSchema,
});

const makeDatabase = ({ actionsEnabled = false } = {}) =>
	new Database({
		adapter,
		modelClasses: [Display],
		actionsEnabled,
	});

describe('UI Model', () => {
	let database: Database;
	let collection: Collection<Display>;

	beforeEach(() => {
		database = makeDatabase();
		collection = database.collections.get('ui_display');
	});

	it('can instantiate new records', () => {
		const model = new Display(collection, { key: 'name' });
		expect(model).toBeInstanceOf(Display);
		expect(model.key).toBe('name');
	});

	it('can create new records', async () => {
		const model: Display = await database.action(async () => {
			const newModel = await collection.create((display) => {
				display.key = 'name';
			});
			return newModel;
		});
		expect(model).toBeInstanceOf(Display);
		expect(model.key).toBe('name');
	});
});
