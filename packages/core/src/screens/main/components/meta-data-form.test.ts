/**
 * @jest-environment node
 *
 * Tests for the metaDataSchema validation.
 *
 * These tests guard against the bug in issue #215 where product variation
 * attribute entries in meta_data (which use attr_id/display_key/display_value
 * instead of key/value) caused form validation to fail silently.
 */
import { metaDataSchema } from './meta-data-schema';

describe('metaDataSchema', () => {
	describe('standard meta_data entries', () => {
		it('should accept entries with key and value', () => {
			const result = metaDataSchema.safeParse([
				{ key: '_woocommerce_pos_data', value: '{"price":"10"}' },
			]);
			expect(result.success).toBe(true);
		});

		it('should accept entries with null value (soft-deleted)', () => {
			const result = metaDataSchema.safeParse([{ id: 42, key: 'some_key', value: null }]);
			expect(result.success).toBe(true);
		});

		it('should accept entries with id, key, and value', () => {
			const result = metaDataSchema.safeParse([
				{ id: 1, key: '_woocommerce_pos_uuid', value: 'abc-123' },
			]);
			expect(result.success).toBe(true);
		});

		it('should accept entries with display_key and display_value', () => {
			const result = metaDataSchema.safeParse([
				{
					id: 1,
					key: 'color',
					value: 'green',
					display_key: 'Color',
					display_value: 'Green',
				},
			]);
			expect(result.success).toBe(true);
		});

		it('should accept an empty array', () => {
			const result = metaDataSchema.safeParse([]);
			expect(result.success).toBe(true);
		});
	});

	describe('variation attribute entries (issue #215)', () => {
		it('should accept entries with attr_id, display_key, display_value only', () => {
			const result = metaDataSchema.safeParse([
				{ attr_id: 1, display_key: 'Color', display_value: 'Green' },
			]);
			expect(result.success).toBe(true);
		});

		it('should accept entries with attr_id but no key or value', () => {
			const result = metaDataSchema.safeParse([
				{ attr_id: 2, display_key: 'Size', display_value: 'Medium' },
			]);
			expect(result.success).toBe(true);
		});

		it('should accept entries with both key/value and attr_id (fallback path)', () => {
			const result = metaDataSchema.safeParse([
				{
					key: 'pa_color',
					value: 'green',
					attr_id: 1,
					display_key: 'Color',
					display_value: 'Green',
				},
			]);
			expect(result.success).toBe(true);
		});
	});

	describe('mixed meta_data (real-world variation line item)', () => {
		it('should accept the exact data shape from issue #215', () => {
			const variationMetaData = [
				{
					key: '_woocommerce_pos_data',
					value: '{"price":"10","regular_price":"10","tax_status":"taxable"}',
				},
				{ attr_id: 1, display_key: 'Color', display_value: 'Green' },
				{ attr_id: 2, display_key: 'Size', display_value: 'Medium' },
				{ key: '_woocommerce_pos_uuid', value: 'abc-def-123' },
			];
			const result = metaDataSchema.safeParse(variationMetaData);
			expect(result.success).toBe(true);
		});

		it('should accept simple product meta_data (only key/value entries)', () => {
			const simpleMetaData = [
				{ key: '_woocommerce_pos_data', value: '{"price":"5"}' },
				{ key: '_woocommerce_pos_uuid', value: 'xyz-789' },
			];
			const result = metaDataSchema.safeParse(simpleMetaData);
			expect(result.success).toBe(true);
		});

		it('should accept meta_data with soft-deleted entries mixed with attributes', () => {
			const mixedMetaData = [
				{ id: 10, key: 'old_key', value: null },
				{ attr_id: 1, display_key: 'Color', display_value: 'Red' },
				{ key: '_woocommerce_pos_uuid', value: 'test-uuid' },
			];
			const result = metaDataSchema.safeParse(mixedMetaData);
			expect(result.success).toBe(true);
		});
	});

	describe('passthrough of unknown properties', () => {
		it('should preserve attr_id in parsed output', () => {
			const input = [{ attr_id: 1, display_key: 'Color', display_value: 'Green' }];
			const result = metaDataSchema.parse(input);
			expect(result[0]).toHaveProperty('attr_id', 1);
		});

		it('should preserve unknown properties from WooCommerce', () => {
			const input = [{ key: 'test', value: 'val', some_future_field: true }];
			const result = metaDataSchema.parse(input);
			expect(result[0]).toHaveProperty('some_future_field', true);
		});
	});

	describe('invalid data', () => {
		it('should reject non-array input', () => {
			const result = metaDataSchema.safeParse('not an array');
			expect(result.success).toBe(false);
		});

		it('should reject array of non-objects', () => {
			const result = metaDataSchema.safeParse(['string', 123]);
			expect(result.success).toBe(false);
		});

		it('should reject entries where key is a number', () => {
			const result = metaDataSchema.safeParse([{ key: 123, value: 'test' }]);
			expect(result.success).toBe(false);
		});

		it('should reject entries where attr_id is a string', () => {
			const result = metaDataSchema.safeParse([{ attr_id: 'not_a_number' }]);
			expect(result.success).toBe(false);
		});
	});
});
