import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { Database, Collection, appSchema, tableSchema, Q } from '@nozbe/watermelondb';
import UI, { uiSchema } from './ui';
import Column, { uiColumnSchema } from './column';
import Display, { uiDisplaySchema } from './display';
import initialData from './initial.json';

const mockSchema = appSchema({
	version: 1,
	tables: [tableSchema(uiSchema), tableSchema(uiColumnSchema), tableSchema(uiDisplaySchema)],
});

const adapter = new LokiJSAdapter({
	dbName: 'tests',
	schema: mockSchema,
	useWebWorker: false,
	useIncrementalIndexedDB: true,
});

const makeDatabase = ({ actionsEnabled = false } = {}) =>
	new Database({
		adapter,
		modelClasses: [UI, Column, Display],
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

	it('creates "columns" as children', async () => {
		const model: UI = await database.action(async () => {
			const newModel = await collection.create((ui) => {
				ui.section = 'pos_products';
				ui.set(initialData.pos_products);
			});
			return newModel;
		});
		const columns = await model.columns.fetch();
		expect(model).toBeInstanceOf(UI);
		expect(columns.length).toEqual(initialData.pos_products.columns.length);
	});

	it('creates "display" as children', async () => {
		const model: UI = await database.action(async () => {
			const newModel = await collection.create((ui) => {
				ui.section = 'pos_products';
				ui.set(initialData.pos_products);
			});
			return newModel;
		});
		const display = await model.display.fetch();
		expect(model).toBeInstanceOf(UI);
		expect(display.length).toEqual(initialData.pos_products.display.length);
	});
});
