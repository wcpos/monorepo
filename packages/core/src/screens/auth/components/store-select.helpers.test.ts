import { storeListsEqual } from './store-select.helpers';

type StoreDocument = import('@wcpos/database').StoreDocument;

function store(fields: { localID?: string; name?: string; id?: number }): StoreDocument {
	return fields as unknown as StoreDocument;
}

/**
 * The picker renders `localID` (as the key and radio value), `name` (as the label) and `id`
 * (as the `#123` badge and the E2E testID), reading all three off the document. The
 * comparator gates whether a new document list reaches render at all, so anything it treats
 * as equal is a field that can go stale on screen.
 */
describe('storeListsEqual', () => {
	const base = [store({ localID: 'a', name: 'Downtown', id: 1 })];

	it('treats an identical list as equal', () => {
		expect(storeListsEqual(base, [store({ localID: 'a', name: 'Downtown', id: 1 })])).toBe(true);
	});

	it('treats a renamed store as changed', () => {
		expect(storeListsEqual(base, [store({ localID: 'a', name: 'Uptown', id: 1 })])).toBe(false);
	});

	it('treats a changed WooCommerce id as changed', () => {
		expect(storeListsEqual(base, [store({ localID: 'a', name: 'Downtown', id: 2 })])).toBe(false);
	});

	it('treats a store id arriving for the first time as changed', () => {
		const pending = [store({ localID: 'a', name: 'Downtown' })];
		expect(storeListsEqual(pending, base)).toBe(false);
	});

	it('treats a different store at the same position as changed', () => {
		expect(storeListsEqual(base, [store({ localID: 'b', name: 'Downtown', id: 1 })])).toBe(false);
	});

	it('treats a different length as changed', () => {
		expect(storeListsEqual(base, [...base, store({ localID: 'b', name: 'Airport', id: 2 })])).toBe(
			false
		);
	});

	it('treats two empty lists as equal', () => {
		expect(storeListsEqual([], [])).toBe(true);
	});
});
