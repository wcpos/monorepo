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

	it('logs the missing key when the caller offers no price evidence', () => {
		// No owner at all is NOT the same as an owner whose prices came back blank:
		// with nothing to go on, the honest answer is still the error.
		jest.clearAllMocks();
		const metaData = [{ key: 'some_other_key', value: 'foo' }];

		expect(getVariablePrices(metaData)).toBeNull();
		expect(getLogger([]).error).toHaveBeenCalledWith(
			"No '_woocommerce_pos_variable_prices' key found in metaData",
			expect.objectContaining({ code: 'PRODUCT421' })
		);
	});

	it('stays silent when the parent carries three blank price fields', () => {
		// Sync/Variable_Prices.php blanks the parent's own price fields for every
		// variable product it touches, THEN drops the meta key when no visible
		// variation has a price. Blank + absent is that documented state, and a
		// merchant mid-setup must not be told to re-save prices they never set.
		jest.clearAllMocks();
		const metaData = [{ key: 'some_other_key', value: 'foo' }];

		expect(
			getVariablePrices(metaData, {
				recordId: 'uuid-1',
				remoteId: 100576,
				name: 'E2E Variable',
				price: '',
				regularPrice: '',
				salePrice: '',
			})
		).toBeNull();
		expect(getLogger([]).error).not.toHaveBeenCalled();
	});

	it('logs, naming the record, when the key is absent but a parent price survives', () => {
		// A surviving own-price means the augmentation never ran on this record —
		// a real fault, and the one the error code is for.
		jest.clearAllMocks();
		const metaData = [{ key: 'some_other_key', value: 'foo' }];

		expect(
			getVariablePrices(metaData, {
				recordId: 'uuid-2',
				remoteId: 4321,
				name: 'Unaugmented Parent',
				sku: 'SKU-1',
				price: '19.99',
				regularPrice: '',
				salePrice: '',
			})
		).toBeNull();
		expect(getLogger([]).error).toHaveBeenCalledWith(
			"No '_woocommerce_pos_variable_prices' key found in metaData",
			expect.objectContaining({
				code: 'PRODUCT421',
				// recordId is load-bearing: persistLog folds consecutive identical
				// events into one counted row and reads the record from here, so
				// without it three broken products collapse into one row naming one.
				context: expect.objectContaining({
					recordId: 'uuid-2',
					productId: 4321,
					productName: 'Unaugmented Parent',
					sku: 'SKU-1',
				}),
			})
		);
	});

	describe('an absent key is two states, told apart by the blanked parent price', () => {
		// `Sync/Variable_Prices.php` REMOVES the entry when no visible variation
		// carries a price, and blanks the parent's own price fields on every
		// variable product it touches. Blank prices are therefore proof the
		// augmentation ran, which makes the absent key its documented signal
		// rather than a fault.
		const missing = [{ key: 'some_other_key', value: 'foo' }];
		const owner = {
			recordId: 'uuid-1',
			remoteId: 100576,
			name: 'E2E Variable',
			sku: 'ZX8',
		};

		it('stays silent when the served parent prices are all blank', () => {
			jest.clearAllMocks();

			expect(
				getVariablePrices(missing, { ...owner, price: '', regularPrice: '', salePrice: '' })
			).toBeNull();
			expect(getLogger([]).error).not.toHaveBeenCalled();
		});

		it('reports the product when a parent price survived — the augmentation never ran', () => {
			jest.clearAllMocks();

			expect(
				getVariablePrices(missing, { ...owner, price: '19.99', regularPrice: '', salePrice: '' })
			).toBeNull();
			expect(getLogger([]).error).toHaveBeenCalledWith(
				"No '_woocommerce_pos_variable_prices' key found in metaData",
				expect.objectContaining({
					code: 'PRODUCT421',
					context: {
						recordId: 'uuid-1',
						productId: 100576,
						productName: 'E2E Variable',
						sku: 'ZX8',
					},
				})
			);
		});

		it('reports when the caller read no price fields — absence is not evidence of blankness', () => {
			jest.clearAllMocks();

			expect(getVariablePrices(missing, owner)).toBeNull();
			expect(getLogger([]).error).toHaveBeenCalledWith(
				"No '_woocommerce_pos_variable_prices' key found in metaData",
				expect.objectContaining({ code: 'PRODUCT421' })
			);
		});
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
				code: 'PRODUCT421',
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
