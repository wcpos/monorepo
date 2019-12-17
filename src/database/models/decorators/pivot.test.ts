// import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { Database } from '@nozbe/watermelondb';
import { appSchema, tableSchema } from '@nozbe/watermelondb';
import pivot from './pivot';
import Base from '../base';

const schema = {};

class Model extends Base {}

const mockSchema = appSchema({
	version: 1,
	tables: [tableSchema(schema)],
});

// const adapter = new LokiJSAdapter({
//   dbName: 'tests',
//   mockSchema,
// });

const makeDatabase = ({ actionsEnabled = false } = {}) =>
	new Database({
		// @ts-ignore
		adapter: { mockSchema },
		// @ts-ignore
		modelClasses: [Model],
		actionsEnabled,
	});

describe('Order Line Item Model', () => {
	it('can instantiate new records', async () => {
		const database = makeDatabase();
		const collection = database.collections.get('tests');
		// const m1 = await collection.create((record: any) => {
		//   record.name = 'Original name';
		// });
		const m1 = await collection.create();
		expect(m1.name).toBe('Original name');
	});
});
