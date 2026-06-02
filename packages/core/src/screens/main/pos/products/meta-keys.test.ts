import { collectMetaKeys } from './meta-keys';

describe('collectMetaKeys', () => {
	it('returns sorted distinct meta keys, skipping empty/undefined', () => {
		const products = [
			{
				meta_data: [
					{ key: '_size', value: 'L' },
					{ key: 'engraving', value: 'x' },
				],
			},
			{
				meta_data: [
					{ key: 'engraving', value: 'y' },
					{ key: '', value: 'z' },
				],
			},
			{ meta_data: [{ value: 'no key' }] },
			{},
		];
		expect(collectMetaKeys(products)).toEqual(['_size', 'engraving']);
	});

	it('returns an empty array for no products', () => {
		expect(collectMetaKeys([])).toEqual([]);
	});
});
