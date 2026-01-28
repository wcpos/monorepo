/**
 * @jest-environment node
 */
import type { ProductDocument } from '@wcpos/database';

import {
	calculateDefaultAmount,
	convertProductToLineItemWithoutTax,
	convertVariationToLineItemWithoutTax,
	extractFeeLineData,
	extractLineItemData,
	extractLineItemPrices,
	extractShippingLineData,
	findByMetaDataUUID,
	findByProductVariationID,
	getMetaDataValueByKey,
	getTaxStatusFromMetaData,
	getUuidFromLineItem,
	getUuidFromLineItemMetaData,
	parsePosData,
	sanitizePrice,
	transformCustomerJSONToOrderJSON,
	updatePosDataMeta,
} from './utils';

// Logger mocks are provided by moduleNameMapper in jest.config.js

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

		it('should return undefined and log error if metaData is not an array', () => {
			// Testing runtime behavior with invalid inputs (would be caught at compile time)
			expect(getUuidFromLineItemMetaData(null as unknown as Array<{ key: string; value: string }>)).toBeUndefined();
			expect(getUuidFromLineItemMetaData(undefined as unknown as Array<{ key: string; value: string }>)).toBeUndefined();
			expect(getUuidFromLineItemMetaData('string' as unknown as Array<{ key: string; value: string }>)).toBeUndefined();
			expect(getUuidFromLineItemMetaData({} as unknown as Array<{ key: string; value: string }>)).toBeUndefined();
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

		it('should return undefined and log error if metaData is not an array', () => {
			// Testing runtime behavior with invalid inputs
			expect(getTaxStatusFromMetaData(null as unknown as Array<{ key: string; value: string }>)).toBeUndefined();
			expect(getTaxStatusFromMetaData(undefined as unknown as Array<{ key: string; value: string }>)).toBeUndefined();
			expect(getTaxStatusFromMetaData({} as unknown as Array<{ key: string; value: string }>)).toBeUndefined();
		});

		it('should return shipping tax status when present', () => {
			const metaData = [{ key: '_woocommerce_pos_tax_status', value: 'shipping' }];
			expect(getTaxStatusFromMetaData(metaData)).toBe('shipping');
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

		it('should return undefined and log error if metaData is not an array', () => {
			// Testing runtime behavior with invalid inputs
			expect(getMetaDataValueByKey(null as unknown as Array<{ key: string; value: string }>, 'key')).toBeUndefined();
			expect(getMetaDataValueByKey(undefined as unknown as Array<{ key: string; value: string }>, 'key')).toBeUndefined();
			expect(getMetaDataValueByKey({} as unknown as Array<{ key: string; value: string }>, 'key')).toBeUndefined();
		});
	});

	// Test getUuidFromLineItem
	describe('getUuidFromLineItem', () => {
		it('should return the UUID from a line item', () => {
			const item = { meta_data: [{ key: '_woocommerce_pos_uuid', value: 'uuid-123' }] };
			expect(getUuidFromLineItem(item)).toBe('uuid-123');
		});

		it('should return undefined if item has no meta_data', () => {
			const item = { meta_data: undefined };
			expect(getUuidFromLineItem(item as { meta_data?: Array<{ key: string; value: string }> })).toBeUndefined();
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

		it('should return undefined and log error if lineItems is not an array', () => {
			type LineItemArray = Array<{ product_id: number; variation_id: number }>;
			// Testing runtime behavior with invalid inputs
			expect(findByProductVariationID(null as unknown as LineItemArray, 1, 0)).toBeUndefined();
			expect(findByProductVariationID(undefined as unknown as LineItemArray, 1, 0)).toBeUndefined();
			expect(findByProductVariationID({} as unknown as LineItemArray, 1, 0)).toBeUndefined();
		});

		it('should match items with undefined variation_id as 0', () => {
			const lineItems = [
				{ product_id: 1, variation_id: undefined as number | undefined },
				{ product_id: 1, variation_id: 2 },
			];
			// When searching for variationId=0, items with undefined variation_id should match
			// because (undefined ?? 0) === 0
			expect(findByProductVariationID(lineItems as Array<{ product_id: number; variation_id: number }>, 1, 0)).toEqual([lineItems[0]]);
		});

		it('should return multiple matching items', () => {
			const lineItems = [
				{ product_id: 1, variation_id: 2 },
				{ product_id: 1, variation_id: 2 },
				{ product_id: 1, variation_id: 3 },
			];
			expect(findByProductVariationID(lineItems, 1, 2)).toHaveLength(2);
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
			} as Parameters<typeof transformCustomerJSONToOrderJSON>[0];
			const transformed = transformCustomerJSONToOrderJSON(customer, 'CA');
			expect(transformed).toEqual({
				customer_id: 1,
				billing: {
					first_name: 'John',
					last_name: 'Doe',
					company: '',
					address_1: '',
					address_2: '',
					city: '',
					state: '',
					postcode: '',
					country: 'US',
					email: 'test@example.com',
					phone: '',
				},
				shipping: {
					first_name: '',
					last_name: '',
					company: '',
					address_1: '',
					address_2: '',
					city: '',
					state: '',
					postcode: '',
					country: '',
				},
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

		it('should include all basic product properties', () => {
			const product = {
				id: 42,
				name: 'Test Product',
				sku: 'SKU-123',
				tax_class: 'reduced-rate',
				price: '25.00',
				regular_price: '30.00',
				tax_status: 'taxable',
			} as ProductDocument;
			const lineItem = convertProductToLineItemWithoutTax(product);

			expect(lineItem.product_id).toBe(42);
			expect(lineItem.name).toBe('Test Product');
			expect(lineItem.sku).toBe('SKU-123');
			expect(lineItem.tax_class).toBe('reduced-rate');
			expect(lineItem.quantity).toBe(1);
		});

		it('should include _woocommerce_pos_data in meta_data', () => {
			const product = {
				id: 1,
				price: '10',
				regular_price: '12',
				tax_status: 'taxable',
			} as ProductDocument;
			const lineItem = convertProductToLineItemWithoutTax(product);

			const posData = lineItem.meta_data?.find((m) => m.key === '_woocommerce_pos_data');
			expect(posData).toBeDefined();

			const parsed = JSON.parse(posData!.value!);
			expect(parsed.price).toBe('10');
			expect(parsed.regular_price).toBe('12');
			expect(parsed.tax_status).toBe('taxable');
		});

		it('should sanitize empty or undefined prices to "0"', () => {
			const product = {
				id: 1,
				price: '',
				regular_price: undefined,
			} as ProductDocument;
			const lineItem = convertProductToLineItemWithoutTax(product);

			const posData = lineItem.meta_data?.find((m) => m.key === '_woocommerce_pos_data');
			const parsed = JSON.parse(posData!.value!);
			expect(parsed.price).toBe('0');
			expect(parsed.regular_price).toBe('0');
		});

		it('should default tax_status to "taxable" if not provided', () => {
			const product = {
				id: 1,
				price: '10',
			} as ProductDocument;
			const lineItem = convertProductToLineItemWithoutTax(product);

			const posData = lineItem.meta_data?.find((m) => m.key === '_woocommerce_pos_data');
			const parsed = JSON.parse(posData!.value!);
			expect(parsed.tax_status).toBe('taxable');
		});

		it('should filter and transfer meta_data based on metaDataKeys', () => {
			const product = {
				id: 1,
				price: '10',
				meta_data: [
					{ key: 'allowed_key', value: 'allowed_value' },
					{ key: 'not_allowed', value: 'ignored' },
					{ key: 'another_allowed', value: 'another_value' },
				],
			} as ProductDocument;
			const lineItem = convertProductToLineItemWithoutTax(product, ['allowed_key', 'another_allowed']);

			// Should include allowed keys plus _woocommerce_pos_data
			expect(lineItem.meta_data).toHaveLength(3);
			expect(lineItem.meta_data?.some((m) => m.key === 'allowed_key')).toBe(true);
			expect(lineItem.meta_data?.some((m) => m.key === 'another_allowed')).toBe(true);
			expect(lineItem.meta_data?.some((m) => m.key === 'not_allowed')).toBe(false);
		});

		it('should not mutate the original product meta_data', () => {
			const originalMetaData = [{ key: 'test', value: 'value' }];
			const product = {
				id: 1,
				price: '10',
				meta_data: originalMetaData,
			} as ProductDocument;
			convertProductToLineItemWithoutTax(product, ['test']);

			expect(originalMetaData).toHaveLength(1);
			expect(originalMetaData[0].key).toBe('test');
		});
	});

	// Test convertVariationToLineItemWithoutTax
	describe('convertVariationToLineItemWithoutTax', () => {
		const parentProduct = {
			id: 100,
			name: 'Variable Product',
		} as ProductDocument;

		const variation = {
			id: 101,
			price: '15',
			regular_price: '20',
			tax_status: 'taxable',
			tax_class: 'standard',
			sku: 'VAR-SKU',
			attributes: [
				{ id: 1, name: 'Color', option: 'Red' },
				{ id: 2, name: 'Size', option: 'Large' },
			],
		} as Parameters<typeof convertVariationToLineItemWithoutTax>[0];

		it('should convert a variation to a line item format', () => {
			const lineItem = convertVariationToLineItemWithoutTax(variation, parentProduct);

			expect(lineItem.product_id).toBe(100); // Parent product ID
			expect(lineItem.variation_id).toBe(101);
			expect(lineItem.name).toBe('Variable Product');
			expect(lineItem.sku).toBe('VAR-SKU');
			expect(lineItem.quantity).toBe(1);
		});

		it('should include variation attributes in meta_data when not provided', () => {
			const lineItem = convertVariationToLineItemWithoutTax(variation, parentProduct);

			// Should have attributes as meta_data
			const colorAttr = lineItem.meta_data?.find((m) => m.key === 'Color');
			const sizeAttr = lineItem.meta_data?.find((m) => m.key === 'Size');

			expect(colorAttr?.value).toBe('Red');
			expect(sizeAttr?.value).toBe('Large');
		});

		it('should use provided metaData for attributes instead of variation attributes', () => {
			const customMetaData = [
				{ key: 'Color', value: 'Blue', display_key: 'Color', display_value: 'Blue' },
			];
			const lineItem = convertVariationToLineItemWithoutTax(variation, parentProduct, customMetaData);

			const colorAttr = lineItem.meta_data?.find((m) => m.key === 'Color');
			expect(colorAttr?.value).toBe('Blue');

			// Should not include the variation's attributes
			const sizeAttr = lineItem.meta_data?.find((m) => m.key === 'Size');
			expect(sizeAttr).toBeUndefined();
		});

		it('should include _woocommerce_pos_data with correct values', () => {
			const lineItem = convertVariationToLineItemWithoutTax(variation, parentProduct);

			const posData = lineItem.meta_data?.find((m) => m.key === '_woocommerce_pos_data');
			expect(posData).toBeDefined();

			const parsed = JSON.parse(posData!.value!);
			expect(parsed.price).toBe('15');
			expect(parsed.regular_price).toBe('20');
			expect(parsed.tax_status).toBe('taxable');
		});

		it('should filter variation meta_data based on metaDataKeys', () => {
			const variationWithMeta = {
				...variation,
				meta_data: [
					{ key: 'allowed', value: 'yes' },
					{ key: 'not_allowed', value: 'no' },
				],
			};
			const lineItem = convertVariationToLineItemWithoutTax(
				variationWithMeta,
				parentProduct,
				undefined,
				['allowed']
			);

			expect(lineItem.meta_data?.some((m) => m.key === 'allowed')).toBe(true);
			expect(lineItem.meta_data?.some((m) => m.key === 'not_allowed')).toBe(false);
		});

		it('should handle variation with empty attributes array', () => {
			const variationNoAttrs = {
				...variation,
				attributes: [],
			};
			const lineItem = convertVariationToLineItemWithoutTax(variationNoAttrs, parentProduct);

			// Should still have _woocommerce_pos_data
			const posData = lineItem.meta_data?.find((m) => m.key === '_woocommerce_pos_data');
			expect(posData).toBeDefined();
		});

		it('should handle variation with undefined attributes', () => {
			const variationUndefinedAttrs = {
				...variation,
				attributes: undefined,
			};
			const lineItem = convertVariationToLineItemWithoutTax(variationUndefinedAttrs, parentProduct);

			// Should not throw and should have _woocommerce_pos_data
			expect(lineItem.product_id).toBe(100);
			const posData = lineItem.meta_data?.find((m) => m.key === '_woocommerce_pos_data');
			expect(posData).toBeDefined();
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
