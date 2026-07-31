import { getLogger } from '@wcpos/utils/logger';

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

	it('returns variable prices from object metadata', () => {
		const metaData = [
			{
				key: '_woocommerce_pos_variable_prices',
				value: {
					price: { min: '10', max: '20' },
					regular_price: { min: '15', max: '25' },
					sale_price: { min: '10', max: '18' },
				},
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

	it('accepts omitted sub-ranges — the server drops a range with no values', () => {
		// e.g. sale_price is absent when no visible variation is on sale
		// (Sync/Variable_Prices.php on next).
		const metaData = [
			{
				key: '_woocommerce_pos_variable_prices',
				value: {
					price: { min: '15', max: '20' },
					regular_price: { min: '15', max: '20' },
				},
			},
		];
		const result = getVariablePrices(metaData);
		expect(result).toEqual({
			price: { min: '15', max: '20' },
			regular_price: { min: '15', max: '20' },
		});
	});

	it('returns null without error for a null value (no priced variations)', () => {
		const metaData = [{ key: '_woocommerce_pos_variable_prices', value: null }];
		expect(getVariablePrices(metaData)).toBeNull();
	});

	it('logs invalid data when the metadata value is omitted', () => {
		jest.clearAllMocks();
		const metaData = [{ key: '_woocommerce_pos_variable_prices' }];

		expect(getVariablePrices(metaData)).toBeNull();
		expect(getLogger([]).error).toHaveBeenCalledWith(
			"'_woocommerce_pos_variable_prices' has invalid structure",
			expect.objectContaining({
				context: expect.objectContaining({ errorCode: 'DB03002' }),
			})
		);
	});

	it('returns null when no known range key is present', () => {
		const metaData = [{ key: '_woocommerce_pos_variable_prices', value: {} }];
		expect(getVariablePrices(metaData)).toBeNull();
	});

	it('returns null when a present range key has an invalid shape', () => {
		const metaData = [
			{
				key: '_woocommerce_pos_variable_prices',
				value: {
					price: { min: '10', max: '20' },
					sale_price: { min: 5 },
				},
			},
		];
		expect(getVariablePrices(metaData)).toBeNull();
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
