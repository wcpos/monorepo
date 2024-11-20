import { addRxPlugin } from 'rxdb';

import populatePlugin from './populate';
import { create, generateNested } from '../tests/helpers/nested-collection';

describe('populatePlugin', () => {
	beforeEach(() => {
		addRxPlugin(populatePlugin);
	});

	afterEach(() => {});

	it('adds a custom upsertRefs method to the Collection prototype', async () => {
		const nestedCollection = await create(1);
		expect(typeof nestedCollection.upsertRefs).toBe('function');
	});

	it('adds a custom removeRefs method to the Collection prototype', async () => {
		const nestedCollection = await create(1);
		expect(typeof nestedCollection.removeRefs).toBe('function');
	});

	it('initalizes the collection with the correct schema', async () => {
		const nestedCollection = await create(1);
		const doc = await nestedCollection.findOne().exec();
		expect(doc.child).toStrictEqual([]);
	});

	it('inserts nested json', async () => {
		const nestedCollection = await create(0);
		const data = {
			...generateNested(),
			child: [generateNested(), generateNested()],
		};
		await nestedCollection.insert(data);
		const doc = await nestedCollection.findOne(data.uuid).exec();
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
		await nestedCollection.insert(data);
		const doc = await nestedCollection.findOne(data.uuid).exec();
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
		const doc = await nestedCollection.insert(json);
		expect(typeof doc.toPopulatedJSON).toBe('function');
		const output = await doc.toPopulatedJSON();
		expect(output).toEqual(json);
	});
});
