/**
 * @jest-environment node
 *
 * Tests for the edit line item form schema.
 *
 * Reproduces the exact scenario from issue #215: the form schema must accept
 * both simple product meta_data (key/value only) and variation product meta_data
 * (attr_id/display_key/display_value without key/value).
 */
import * as z from 'zod';

import { metaDataSchema } from '../../../../components/meta-data-schema';

/**
 * Recreate the form schema as defined in form.tsx to test it in isolation
 * without importing the React component.
 */
const formSchema = z.object({
	name: z.string().optional(),
	sku: z.string().optional(),
	quantity: z.number().optional(),
	price: z.number().optional(),
	regular_price: z.number().optional(),
	tax_status: z.enum(['taxable', 'none']),
	tax_class: z.string().optional(),
	meta_data: metaDataSchema,
});

describe('EditLineItemForm schema', () => {
	const baseFields = {
		name: 'Test Product',
		sku: 'SKU-001',
		quantity: 1,
		price: 10,
		regular_price: 10,
		tax_status: 'taxable' as const,
		tax_class: 'standard',
	};

	it('should validate a simple product line item', () => {
		const result = formSchema.safeParse({
			...baseFields,
			meta_data: [
				{
					key: '_woocommerce_pos_data',
					value: '{"price":"10","regular_price":"10","tax_status":"taxable"}',
				},
				{ key: '_woocommerce_pos_uuid', value: 'uuid-simple-001' },
			],
		});
		expect(result.success).toBe(true);
	});

	it('should validate a variation line item with attribute meta_data (issue #215)', () => {
		const result = formSchema.safeParse({
			...baseFields,
			name: 'Masker Modis 4ply Wa',
			meta_data: [
				{
					key: '_woocommerce_pos_data',
					value: '{"price":"10","regular_price":"10","tax_status":"taxable"}',
				},
				{ attr_id: 1, display_key: 'Color', display_value: 'Green' },
				{ attr_id: 2, display_key: 'Size', display_value: 'Medium' },
				{ key: '_woocommerce_pos_uuid', value: 'uuid-variation-001' },
			],
		});
		expect(result.success).toBe(true);
	});

	it('should validate a variation with attributes that include key/value (fallback path)', () => {
		const result = formSchema.safeParse({
			...baseFields,
			meta_data: [
				{ key: '_woocommerce_pos_data', value: '{"price":"5"}' },
				{
					key: 'pa_color',
					value: 'green',
					attr_id: 1,
					display_key: 'Color',
					display_value: 'Green',
				},
				{ key: '_woocommerce_pos_uuid', value: 'uuid-fallback-001' },
			],
		});
		expect(result.success).toBe(true);
	});

	it('should validate with empty meta_data', () => {
		const result = formSchema.safeParse({
			...baseFields,
			meta_data: [],
		});
		expect(result.success).toBe(true);
	});

	it('should preserve attr_id through parsing', () => {
		const input = {
			...baseFields,
			meta_data: [{ attr_id: 1, display_key: 'Color', display_value: 'Green' }],
		};
		const result = formSchema.parse(input);
		expect(result.meta_data[0]).toHaveProperty('attr_id', 1);
		expect(result.meta_data[0]).toHaveProperty('display_key', 'Color');
	});
});
