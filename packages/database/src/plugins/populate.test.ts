import { addRxPlugin } from 'rxdb';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';

import { populatePlugin } from './populate';
import { create, generateNested } from '../tests/helpers/nested-collection';

// Type for collection with plugin methods
type NestedCollection = Awaited<ReturnType<typeof create>> & {
	upsertRefs: (data: any) => Promise<void>;
	removeRefs: (data: any) => Promise<void>;
};

// Type for document with plugin methods
interface NestedDoc {
	child: string[];
	populate: (key: string) => Promise<NestedDoc[]>;
	toPopulatedJSON: () => Promise<any>;
}

// Add required plugins once before all tests
beforeAll(() => {
	addRxPlugin(RxDBQueryBuilderPlugin);
	addRxPlugin(populatePlugin);
});

describe('populatePlugin', () => {
	it('adds a custom upsertRefs method to the Collection prototype', async () => {
		const nestedCollection = (await create(1)) as NestedCollection;
		expect(typeof nestedCollection.upsertRefs).toBe('function');
	});

	it('adds a custom removeRefs method to the Collection prototype', async () => {
		const nestedCollection = (await create(1)) as NestedCollection;
		expect(typeof nestedCollection.removeRefs).toBe('function');
	});

	it('initalizes the collection with the correct schema', async () => {
		const nestedCollection = await create(1);
		const doc = (await nestedCollection.findOne().exec()) as unknown as NestedDoc;
		expect(doc.child).toStrictEqual([]);
	});

	it('inserts nested json', async () => {
		const nestedCollection = await create(0);
		const data = {
			...generateNested(),
			child: [generateNested(), generateNested()],
		};
		await nestedCollection.insert(data as any);
		const doc = (await nestedCollection.findOne(data.uuid).exec()) as unknown as NestedDoc;
		expect(doc.child.length).toBe(2);
		const count = await nestedCollection.count().exec();
		expect(count).toBe(3);
		const children = await doc.populate('child');
		expect(children.length).toBe(2);
	});

	it('inserts deeply nested json', async () => {
		const nestedCollection = await create(0);
		const data = {
			...generateNested(),
			child: [{ ...generateNested(), child: [generateNested()] }, generateNested()],
		};
		await nestedCollection.insert(data as any);
		const doc = (await nestedCollection.findOne(data.uuid).exec()) as unknown as NestedDoc;
		expect(doc.child.length).toBe(2);
		const count = await nestedCollection.count().exec();
		expect(count).toBe(4);
		const children = await doc.populate('child');
		expect(children[0].child.length).toBe(1);
	});

	it('provides a toPopulatedJSON function which populates and exports the nested document data', async () => {
		const nestedCollection = await create(0);
		const json = {
			uuid: '123',
			name: 'test',
			child: [{ uuid: '456', name: 'test2', child: [] }],
		};
		const doc = (await nestedCollection.insert(json as any)) as unknown as NestedDoc;
		expect(typeof doc.toPopulatedJSON).toBe('function');
		const output = await doc.toPopulatedJSON();
		expect(output).toEqual(json);
	});
});
