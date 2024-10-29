import { ProductDocument } from '@wcpos/database';

import {
	sanitizePrice,
	getUuidFromLineItemMetaData,
	getTaxStatusFromMetaData,
	getMetaDataValueByKey,
	getUuidFromLineItem,
	findByMetaDataUUID,
	findByProductVariationID,
	transformCustomerJSONToOrderJSON,
	convertProductToLineItemWithoutTax,
	convertVariationToLineItemWithoutTax,
	updatePosDataMeta,
	parsePosData,
	extractLineItemPrices,
	extractLineItemData,
	extractFeeLineData,
	calculateDefaultAmount,
	extractShippingLineData,
} from './utils';

describe('Utilities', () => {
	// Test sanitizePrice
	describe('sanitizePrice', () => {
		it('should return the string representation of a valid price', () => {
			expect(sanitizePrice('19.99')).toBe('19.99');
		});

		it('should return "0" for empty or undefined prices', () => {
			expect(sanitizePrice('')).toBe('0');
			expect(sanitizePrice(undefined)).toBe('0');
		});
	});

	// Test getUuidFromLineItemMetaData
	describe('getUuidFromLineItemMetaData', () => {
		it('should return the UUID if present in meta data', () => {
			const metaData = [{ key: '_woocommerce_pos_uuid', value: '1234' }];
			expect(getUuidFromLineItemMetaData(metaData)).toBe('1234');
		});

		it('should return undefined if UUID is not present', () => {
			const metaData = [{ key: 'other_key', value: '5678' }];
			expect(getUuidFromLineItemMetaData(metaData)).toBeUndefined();
		});
	});

	// Test getTaxStatusFromMetaData
	describe('getTaxStatusFromMetaData', () => {
		it('should return tax status if present in meta data', () => {
			const metaData = [{ key: '_woocommerce_pos_tax_status', value: 'none' }];
			expect(getTaxStatusFromMetaData(metaData)).toBe('none');
		});

		it('should default to "taxable" if tax status is not present', () => {
			const metaData = [{ key: 'other_key', value: 'value' }];
			expect(getTaxStatusFromMetaData(metaData)).toBe('taxable');
		});
	});

	// Test getMetaDataValueByKey
	describe('getMetaDataValueByKey', () => {
		it('should return the correct value for a given key', () => {
			const metaData = [{ key: 'example_key', value: 'example_value' }];
			expect(getMetaDataValueByKey(metaData, 'example_key')).toBe('example_value');
		});

		it('should return undefined if the key is not present', () => {
			const metaData = [{ key: 'another_key', value: 'value' }];
			expect(getMetaDataValueByKey(metaData, 'example_key')).toBeUndefined();
		});
	});

	// Test findByMetaDataUUID
	describe('findByMetaDataUUID', () => {
		it('should return the item if a matching UUID is found', () => {
			const items = [{ meta_data: [{ key: '_woocommerce_pos_uuid', value: '1234' }] }];
			expect(findByMetaDataUUID(items, '1234')).toEqual(items[0]);
		});

		it('should return null if no matching UUID is found', () => {
			const items = [{ meta_data: [{ key: '_woocommerce_pos_uuid', value: '5678' }] }];
			expect(findByMetaDataUUID(items, '1234')).toBeNull();
		});
	});

	// Test findByProductVariationID
	describe('findByProductVariationID', () => {
		it('should return items with matching product ID and variation ID', () => {
			const lineItems = [
				{ product_id: 1, variation_id: 2 },
				{ product_id: 1, variation_id: 0 },
			];
			expect(findByProductVariationID(lineItems, 1, 2)).toEqual([lineItems[0]]);
		});

		it('should return an empty array if no matches found', () => {
			const lineItems = [{ product_id: 2, variation_id: 1 }];
			expect(findByProductVariationID(lineItems, 1, 0)).toEqual([]);
		});
	});

	// Test transformCustomerJSONToOrderJSON
	describe('transformCustomerJSONToOrderJSON', () => {
		it('should transform a customer JSON object to order JSON format', () => {
			const customer = {
				id: 1,
				email: 'test@example.com',
				first_name: 'John',
				last_name: 'Doe',
				billing: { country: 'US' },
				shipping: {},
			};
			const transformed = transformCustomerJSONToOrderJSON(customer, 'CA');
			expect(transformed).toEqual({
				customer_id: 1,
				billing: { country: 'US', email: 'test@example.com', first_name: 'John', last_name: 'Doe' },
				shipping: {},
			});
		});
	});

	// Test convertProductToLineItemWithoutTax
	describe('convertProductToLineItemWithoutTax', () => {
		it('should convert a product to a line item format', () => {
			const product = {
				id: 1,
				price: '10',
				regular_price: '12',
				tax_status: 'taxable',
			} as ProductDocument;
			const lineItem = convertProductToLineItemWithoutTax(product);
			expect(lineItem.product_id).toBe(1);
			expect(lineItem.meta_data?.length).toBeGreaterThan(0);
		});
	});

	// Test parsePosData
	describe('parsePosData', () => {
		it('should parse valid POS data from a line item', () => {
			const item = { meta_data: [{ key: '_woocommerce_pos_data', value: '{"test": 123}' }] };
			expect(parsePosData(item)).toEqual({ test: 123 });
		});

		it('should return null if parsing fails', () => {
			const item = { meta_data: [{ key: '_woocommerce_pos_data', value: 'invalid_json' }] };
			expect(parsePosData(item)).toBeNull();
		});
	});

	// Test updatePosDataMeta
	describe('updatePosDataMeta', () => {
		it('should add new POS data if none exists', () => {
			const item = { meta_data: [] };
			const updatedItem = updatePosDataMeta(item, { key: 'value' });
			expect(updatedItem.meta_data?.[0].key).toBe('_woocommerce_pos_data');
		});

		it('should merge with existing POS data', () => {
			const item = {
				meta_data: [{ key: '_woocommerce_pos_data', value: '{"key": "old_value"}' }],
			};
			const updatedItem = updatePosDataMeta(item, { newKey: 'new_value' });
			expect(JSON.parse(updatedItem.meta_data?.[0]?.value || '')).toEqual({
				key: 'old_value',
				newKey: 'new_value',
			});
		});
	});

	describe('line item data', () => {
		describe('calculatePrices', () => {
			it('calculates price and regular price with tax included', () => {
				const item = {
					quantity: 2,
					total: '20',
					subtotal: '18',
					total_tax: '2',
					subtotal_tax: '1',
				};
				const prices = extractLineItemPrices(item, true);
				expect(prices).toEqual({ price: 11, regularPrice: 9.5 });
			});

			it('calculates price and regular price without tax included', () => {
				const item = {
					quantity: 2,
					total: '20',
					subtotal: '18',
					total_tax: '2',
					subtotal_tax: '1',
				};
				const prices = extractLineItemPrices(item, false);
				expect(prices).toEqual({ price: 10, regularPrice: 9 });
			});
		});

		describe('extractLineItemData', () => {
			it('returns calculated prices and default tax status if no metadata', () => {
				const item = {
					quantity: 2,
					total: '20',
					subtotal: '18',
					total_tax: '2',
					subtotal_tax: '1',
					meta_data: [],
				};
				const result = extractLineItemData(item, true);
				expect(result).toEqual({ price: 11, regular_price: 9.5, tax_status: 'taxable' });
			});

			it('uses posData values from metadata if present', () => {
				const item = {
					quantity: 2,
					total: '20',
					subtotal: '18',
					total_tax: '2',
					subtotal_tax: '1',
					meta_data: [
						{
							key: '_woocommerce_pos_data',
							value: '{"price": 15, "regular_price": 10, "tax_status": "none"}',
						},
					],
				};
				const result = extractLineItemData(item, true);
				expect(result).toEqual({ price: 15, regular_price: 10, tax_status: 'none' });
			});

			it('falls back to defaults when posData values are missing', () => {
				const item = {
					quantity: 2,
					total: '20',
					subtotal: '18',
					total_tax: '2',
					subtotal_tax: '1',
					meta_data: [{ key: '_woocommerce_pos_data', value: '{"tax_status": "none"}' }],
				};
				const result = extractLineItemData(item, true);
				expect(result).toEqual({ price: 11, regular_price: 9.5, tax_status: 'none' });
			});
		});
	});

	describe('Fee Line Utils', () => {
		// Tests for calculateDefaultAmount
		describe('calculateDefaultAmount', () => {
			it('calculates total amount including tax when pricesIncludeTax is true', () => {
				const item = { total: '100', total_tax: '20' };
				expect(calculateDefaultAmount(item, true)).toBe(120);
			});

			it('calculates total amount excluding tax when pricesIncludeTax is false', () => {
				const item = { total: '100', total_tax: '20' };
				expect(calculateDefaultAmount(item, false)).toBe(100);
			});

			it('handles missing or undefined total and total_tax', () => {
				const item = { total: undefined, total_tax: undefined };
				expect(calculateDefaultAmount(item, true)).toBe(0);
				expect(calculateDefaultAmount(item, false)).toBe(0);
			});

			it('handles total and total_tax as numbers', () => {
				const item = { total: 50, total_tax: 5 };
				// @ts-ignore
				expect(calculateDefaultAmount(item, true)).toBe(55);
				// @ts-ignore
				expect(calculateDefaultAmount(item, false)).toBe(50);
			});
		});

		// Tests for extractFeeLineData
		describe('extractFeeLineData', () => {
			const item = { total: '100', total_tax: '20', meta_data: [] };

			it('returns defaults when no posData is present', () => {
				const result = extractFeeLineData(item, true);
				expect(result).toEqual({
					amount: 120,
					percent: false,
					prices_include_tax: true,
					percent_of_cart_total_with_tax: true,
				});
			});

			it('parses and uses posData values if present', () => {
				const metaData = [
					{
						key: '_woocommerce_pos_data',
						value: '{"amount":"11","percent":false,"prices_include_tax":true}',
					},
				];
				const result = extractFeeLineData({ ...item, meta_data: metaData }, false);
				expect(result).toEqual({
					amount: 11, // parsed and coerced to number
					percent: false, // parsed as boolean
					prices_include_tax: true, // parsed as boolean
					percent_of_cart_total_with_tax: false, // falls back to pricesIncludeTax
				});
			});

			it('handles posData with mixed data types and coerces them correctly', () => {
				const metaData = [
					{
						key: '_woocommerce_pos_data',
						value:
							'{"amount":"15","percent":"1","prices_include_tax":"false","percent_of_cart_total_with_tax":0}',
					},
				];
				const result = extractFeeLineData({ ...item, meta_data: metaData }, true);
				expect(result).toEqual({
					amount: 15, // coerced to number
					percent: true, // coerced to boolean from "1"
					prices_include_tax: false, // coerced to boolean from "false"
					percent_of_cart_total_with_tax: false, // coerced to boolean from 0
				});
			});

			it('falls back to default values when posData values are missing or undefined', () => {
				const metaData = [
					{
						key: '_woocommerce_pos_data',
						value: '{"percent_of_cart_total_with_tax":1}', // Only one value provided
					},
				];
				const result = extractFeeLineData({ ...item, meta_data: metaData }, false);
				expect(result).toEqual({
					amount: 100, // Default calculated without tax
					percent: false, // Default
					prices_include_tax: false, // Default from pricesIncludeTax
					percent_of_cart_total_with_tax: true, // Parsed from posData (1 -> true)
				});
			});

			it('returns defaults when meta_data key is missing or invalid', () => {
				const metaData = [
					{
						key: 'wrong_key', // Incorrect key
						value: '{"amount":20}',
					},
				];
				const result = extractFeeLineData({ ...item, meta_data: metaData }, false);
				expect(result).toEqual({
					amount: 100, // Default without tax
					percent: false, // Default
					prices_include_tax: false, // Default
					percent_of_cart_total_with_tax: false, // Default
				});
			});

			it('returns defaults when posData JSON is malformed', () => {
				const metaData = [
					{
						key: '_woocommerce_pos_data',
						value: '{"amount": "10", "percent": true,', // Malformed JSON
					},
				];
				const result = extractFeeLineData({ ...item, meta_data: metaData }, true);
				expect(result).toEqual({
					amount: 120, // Default with tax
					percent: false, // Default
					prices_include_tax: true, // Default
					percent_of_cart_total_with_tax: true, // Default
				});
			});
		});
	});

	describe('Shipping Line Utils', () => {
		// Tests for extractShippingLineData
		describe('extractShippingLineData', () => {
			const item = { total: '100', total_tax: '20', meta_data: [] };

			it('returns defaults when no posData is present', () => {
				const result = extractShippingLineData(item, true, 'standard');
				expect(result).toEqual({
					amount: 120,
					tax_status: 'taxable',
					tax_class: 'standard',
					prices_include_tax: true,
				});
			});

			it('parses and uses posData values if present', () => {
				const metaData = [
					{
						key: '_woocommerce_pos_data',
						value:
							'{"amount":"80","tax_status":"none","tax_class":"reduced","prices_include_tax":false}',
					},
				];
				const result = extractShippingLineData({ ...item, meta_data: metaData }, false, 'standard');
				expect(result).toEqual({
					amount: 80, // parsed and coerced to number
					tax_status: 'none', // parsed from posData
					tax_class: 'reduced', // parsed from posData
					prices_include_tax: false, // parsed as boolean
				});
			});

			it('handles posData with mixed data types and coerces them correctly', () => {
				const metaData = [
					{
						key: '_woocommerce_pos_data',
						value: '{"amount":"75","prices_include_tax":"1"}',
					},
				];
				const result = extractShippingLineData({ ...item, meta_data: metaData }, false, 'standard');
				expect(result).toEqual({
					amount: 75, // coerced to number
					tax_status: 'taxable', // falls back to default
					tax_class: 'standard', // default tax class
					prices_include_tax: true, // coerced to boolean from "1"
				});
			});

			it('falls back to default values when posData values are missing or undefined', () => {
				const metaData = [
					{
						key: '_woocommerce_pos_data',
						value: '{"tax_class":"reduced"}', // Only one value provided
					},
				];
				const result = extractShippingLineData({ ...item, meta_data: metaData }, true, 'inherit');
				expect(result).toEqual({
					amount: 120, // calculated default with tax
					tax_status: 'taxable', // default tax status
					tax_class: 'reduced', //
					prices_include_tax: true, // default from pricesIncludeTax
				});
			});

			it('returns defaults when meta_data key is missing or invalid', () => {
				const metaData = [
					{
						key: 'wrong_key', // Incorrect key
						value: '{"amount":40}',
					},
				];
				const result = extractShippingLineData({ ...item, meta_data: metaData }, true, 'standard');
				expect(result).toEqual({
					amount: 120, // calculated default with tax
					tax_status: 'taxable', // default
					tax_class: 'standard', // default
					prices_include_tax: true, // default
				});
			});

			it('returns defaults when posData JSON is malformed', () => {
				const metaData = [
					{
						key: '_woocommerce_pos_data',
						value: '{"amount": "30", "tax_status": "none",', // Malformed JSON
					},
				];
				const result = extractShippingLineData({ ...item, meta_data: metaData }, false, 'standard');
				expect(result).toEqual({
					amount: 100, // calculated default without tax
					tax_status: 'taxable', // default
					tax_class: 'standard', // default
					prices_include_tax: false, // default
				});
			});
		});
	});
});
