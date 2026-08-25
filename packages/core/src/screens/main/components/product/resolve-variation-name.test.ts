import { resolveVariationName } from './resolve-variation-name';

/**
 * The variation row must read the same whatever plugin the store is on.
 */
describe('resolveVariationName', () => {
	const attrs = [
		{ id: 1, name: 'Colour', option: 'Blue' },
		{ id: 2, name: 'Size', option: 'Large' },
		{ id: 3, name: 'Fabric', option: 'Cotton' },
	];

	it('reproduces what plugin 1.10.1 sends: values only, comma-joined, no parent', () => {
		expect(resolveVariationName({ name: 'Blue, Large, Cotton', attributes: attrs })).toBe(
			'Blue, Large, Cotton'
		);
	});

	// The defect this exists for. On 1.10.0, generate_product_title() collapses to just the parent
	// name at 3+ attributes, so every row on such a product renders the identical string.
	it('recovers a collapsed 1.10.0 name from the attributes', () => {
		expect(resolveVariationName({ name: 'Chromatic', attributes: attrs })).toBe(
			'Blue, Large, Cotton'
		);
	});

	// Below 3 attributes 1.10.0 sends "<Parent> - <attrs>". Dropping the redundant parent prefix is
	// what makes the row identical before and after the merchant updates.
	it('drops the redundant parent prefix a 1.10.0 name carries below 3 attributes', () => {
		expect(
			resolveVariationName({ name: 'Chromatic - Blue, Large', attributes: attrs.slice(0, 2) })
		).toBe('Blue, Large');
	});

	it('treats an "any" attribute as absence, matching wc_get_formatted_variation', () => {
		expect(
			resolveVariationName({
				name: 'x',
				attributes: [
					{ id: 1, name: 'Colour', option: 'Blue' },
					{ id: 2, name: 'Size', option: '' },
				],
			})
		).toBe('Blue');
	});

	it('falls back to the served name when no usable attribute survives', () => {
		expect(resolveVariationName({ name: 'Fallback', attributes: [] })).toBe('Fallback');
		expect(resolveVariationName({ name: 'Fallback' })).toBe('Fallback');
		expect(resolveVariationName({ name: 'Fallback', attributes: 'nonsense' })).toBe('Fallback');
	});

	it('never throws on malformed entries, and never renders undefined', () => {
		expect(
			resolveVariationName({
				attributes: [null, { name: 'Size' }, { id: 1, name: 'C', option: 'Red' }],
			})
		).toBe('Red');
		expect(resolveVariationName({})).toBe('');
	});
});
