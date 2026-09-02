import {
	getSlotEntries,
	getSlotEntryComponent,
	registerSlotEntry,
	resetSlotRegistry,
	SLOT_API_VERSION,
} from './registry';

const Noop = () => null;

function register(id: string, order: number) {
	registerSlotEntry({
		id,
		slot: 'pos.products.filter-bar.item',
		order,
		title: id,
		capabilities: [],
		component: Noop,
	});
}

describe('slot registry', () => {
	beforeEach(() => resetSlotRegistry());
	afterEach(() => jest.restoreAllMocks());

	it('is empty for a slot nothing registered into', () => {
		expect(getSlotEntries('pos.columns.panel')).toEqual([]);
		expect(getSlotEntryComponent('pos.columns.panel', 'products')).toBeUndefined();
	});

	it('orders by order, then by id', () => {
		register('zebra', 10);
		register('apple', 10);
		register('first', 5);

		expect(getSlotEntries('pos.products.filter-bar.item').map((entry) => entry.id)).toEqual([
			'first',
			'apple',
			'zebra',
		]);
	});

	it('replaces a duplicate id in the same slot and warns', () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		const Replacement = () => null;
		register('quick-filters', 10);
		registerSlotEntry({
			id: 'quick-filters',
			slot: 'pos.products.filter-bar.item',
			order: 20,
			title: 'Replaced',
			capabilities: [],
			component: Replacement,
		});

		const entries = getSlotEntries('pos.products.filter-bar.item');
		expect(entries).toHaveLength(1);
		expect(entries[0].title).toBe('Replaced');
		expect(getSlotEntryComponent('pos.products.filter-bar.item', 'quick-filters')).toBe(
			Replacement
		);
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it('stamps the contract version and keeps descriptors JSON-serializable', () => {
		registerSlotEntry({
			id: 'products',
			slot: 'pos.columns.panel',
			order: 10,
			title: 'Products',
			capabilities: ['ui.toast'],
			component: Noop,
		});

		const [descriptor] = getSlotEntries('pos.columns.panel');
		expect(descriptor.slotApiVersion).toBe(SLOT_API_VERSION);
		// The descriptor is the part of a registration that may one day cross a bundle
		// boundary — nothing in it may be a function, a class instance, or a database object.
		expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
	});

	it('returns a stable snapshot until a registration changes it', () => {
		register('quick-filters', 10);
		const first = getSlotEntries('pos.products.filter-bar.item');
		expect(getSlotEntries('pos.products.filter-bar.item')).toBe(first);

		register('another', 20);
		expect(getSlotEntries('pos.products.filter-bar.item')).not.toBe(first);
	});
});
