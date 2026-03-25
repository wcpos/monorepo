import { getVariablePrices } from './get-variable-prices';

describe('getVariablePrices', () => {
	it('returns parsed variable prices from metadata', () => {
		const metaData = [
			{
				key: '_woocommerce_pos_variable_prices',
				value: JSON.stringify({
					price: { min: '10', max: '20' },
					regular_price: { min: '15', max: '25' },
					sale_price: { min: '10', max: '18' },
				}),
			},
		];

		const result = getVariablePrices(metaData);
		expect(result).toEqual({
			price: { min: '10', max: '20' },
			regular_price: { min: '15', max: '25' },
			sale_price: { min: '10', max: '18' },
		});
	});

	it('returns null when metaData is undefined', () => {
		const result = getVariablePrices(undefined);
		expect(result).toBeNull();
	});

	it('returns null when _woocommerce_pos_variable_prices key is missing', () => {
		const metaData = [{ key: 'some_other_key', value: 'foo' }];
		const result = getVariablePrices(metaData);
		expect(result).toBeNull();
	});

	it('returns null when value is not valid JSON', () => {
		const metaData = [{ key: '_woocommerce_pos_variable_prices', value: 'not-json' }];
		const result = getVariablePrices(metaData);
		expect(result).toBeNull();
	});

	it('returns null when parsed JSON is missing required price range keys', () => {
		const metaData = [
			{
				key: '_woocommerce_pos_variable_prices',
				value: JSON.stringify({
					price: { min: '10', max: '20' },
					// regular_price intentionally missing
					sale_price: { min: '', max: '' },
				}),
			},
		];
		const result = getVariablePrices(metaData);
		expect(result).toBeNull();
	});

	it('returns null when parsed JSON has wrong types for min/max', () => {
		const metaData = [
			{
				key: '_woocommerce_pos_variable_prices',
				value: JSON.stringify({
					price: { min: 10, max: 20 },
					regular_price: { min: 10, max: 20 },
					sale_price: { min: 0, max: 0 },
				}),
			},
		];
		const result = getVariablePrices(metaData);
		expect(result).toBeNull();
	});

	it('handles empty sale_price values (no variations on sale)', () => {
		const metaData = [
			{
				key: '_woocommerce_pos_variable_prices',
				value: JSON.stringify({
					price: { min: '10', max: '20' },
					regular_price: { min: '10', max: '20' },
					sale_price: { min: '', max: '' },
				}),
			},
		];

		const result = getVariablePrices(metaData);
		expect(result).toEqual({
			price: { min: '10', max: '20' },
			regular_price: { min: '10', max: '20' },
			sale_price: { min: '', max: '' },
		});
	});
});
