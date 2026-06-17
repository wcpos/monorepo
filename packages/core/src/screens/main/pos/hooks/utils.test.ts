/**
 * @jest-environment node
 */
import type { ProductDocument, TaxId } from '@wcpos/database';

import {
	type CartLine,
	convertProductToLineItemWithoutTax,
	convertVariationToLineItemWithoutTax,
	findByMetaDataUUID,
	findByProductVariationID,
	getTaxStatusFromMetaData,
	transformCustomerJSONToOrderJSON,
} from './utils';

// Logger mocks are provided by moduleNameMapper in jest.config.js

describe('Utilities', () => {
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
			expect(
				getTaxStatusFromMetaData(null as unknown as { key: string; value: string }[])
			).toBeUndefined();
			expect(
				getTaxStatusFromMetaData(undefined as unknown as { key: string; value: string }[])
			).toBeUndefined();
			expect(
				getTaxStatusFromMetaData({} as unknown as { key: string; value: string }[])
			).toBeUndefined();
		});

		it('should return shipping tax status when present', () => {
			const metaData = [{ key: '_woocommerce_pos_tax_status', value: 'shipping' }];
			expect(getTaxStatusFromMetaData(metaData)).toBe('shipping');
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
			type LineItemArray = { product_id: number; variation_id: number }[];
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
			expect(
				findByProductVariationID(lineItems as { product_id: number; variation_id: number }[], 1, 0)
			).toEqual([lineItems[0]]);
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
				tax_ids: [],
			});
		});

		it('should snapshot customer tax_ids by value', () => {
			const taxIds: TaxId[] = [
				{
					type: 'us_ein',
					value: '12-3456789',
					country: 'US',
					label: null,
					verified: { status: 'verified', source: 'test' },
				},
			];
			const customer = {
				id: 1,
				email: 'test@example.com',
				first_name: 'John',
				last_name: 'Doe',
				billing: { country: 'US' },
				shipping: {},
				tax_ids: taxIds,
			} as Parameters<typeof transformCustomerJSONToOrderJSON>[0];

			const transformed = transformCustomerJSONToOrderJSON(customer, 'CA');
			expect(transformed.tax_ids).toEqual(taxIds);
			expect(transformed.tax_ids).not.toBe(taxIds);
			expect(transformed.tax_ids?.[0]).not.toBe(taxIds[0]);

			taxIds[0].verified = { status: 'pending', source: 'mutated' };
			expect(transformed.tax_ids?.[0]?.verified).toEqual({ status: 'verified', source: 'test' });
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
				images: [{ id: 77, src: 'https://example.com/product.jpg' }],
			} as ProductDocument;
			const lineItem = convertProductToLineItemWithoutTax(product);

			expect(lineItem.product_id).toBe(42);
			expect(lineItem.name).toBe('Test Product');
			expect(lineItem.sku).toBe('SKU-123');
			expect(lineItem.tax_class).toBe('reduced-rate');
			expect(lineItem.quantity).toBe(1);
			expect(lineItem.image).toEqual({ id: 77, src: 'https://example.com/product.jpg' });
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
			const lineItem = convertProductToLineItemWithoutTax(product, [
				'allowed_key',
				'another_allowed',
			]);

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
			image: { id: 201, src: 'https://example.com/variation.jpg' },
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
			expect(lineItem.image).toEqual({ id: 201, src: 'https://example.com/variation.jpg' });
		});

		it('should fall back to the parent product image when the variation has no image', () => {
			const parentWithImage = {
				...parentProduct,
				images: [{ id: 301, src: 'https://example.com/parent.jpg' }],
			} as ProductDocument;
			const lineItem = convertVariationToLineItemWithoutTax(
				{ ...variation, image: null },
				parentWithImage
			);

			expect(lineItem.image).toEqual({ id: 301, src: 'https://example.com/parent.jpg' });
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
			const lineItem = convertVariationToLineItemWithoutTax(
				variation,
				parentProduct,
				customMetaData
			);

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
});
