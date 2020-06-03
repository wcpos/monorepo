import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { Database, Collection, appSchema, tableSchema } from '@nozbe/watermelondb';
import Product, { productSchema } from './product';
import Meta, { metaSchema } from './meta';
import mockProduct from '../../../../jest/__fixtures__/product.json';

const mockSchema = appSchema({
	version: 1,
	tables: [tableSchema(productSchema), tableSchema(metaSchema)],
});

const adapter = new LokiJSAdapter({
	dbName: 'tests',
	schema: mockSchema,
});

const makeDatabase = ({ actionsEnabled = false } = {}) =>
	new Database({
		adapter,
		modelClasses: [Product, Meta],
		actionsEnabled,
	});

describe('UI Model', () => {
	let database: Database;
	let collection: Collection<Product>;

	beforeEach(() => {
		database = makeDatabase();
		collection = database.collections.get('products');
	});

	it('can instantiate new records', () => {
		const model = new Product(collection, mockProduct);
		expect(model).toBeInstanceOf(Product);
		expect(model.name).toBe('Premium Quality');
	});

	it('can create new records', async () => {
		const model: Product = await database.action(async () => {
			const newModel = await collection.create((product) => {
				product.set(mockProduct);
			});
			return newModel;
		});
		expect(model).toBeInstanceOf(Product);
		expect(model.name).toBe('Premium Quality');
		expect(model.remote_id).toBe(794);
		expect(model.id).not.toBe(794);
	});

	it('creates "meta" as children', async () => {
		const mockMeta = [{ key: 'value' }, { foo: 'bar' }];
		const model: Product = await database.action(async () => {
			const newModel = await collection.create((product) => {
				product.set(mockProduct);
				product.set({ meta_data: mockMeta });
			});
			return newModel;
		});
		const meta = await model.meta_data.fetch();
		expect(model).toBeInstanceOf(Product);
		expect(meta.length).toBe(2);
		expect(meta).toBe(mockMeta);
	});
});
