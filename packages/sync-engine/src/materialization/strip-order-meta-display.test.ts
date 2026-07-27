import { describe, expect, it } from 'vitest';

import { stripNonStringMetaDisplayFields } from './strip-order-meta-display';

describe('stripNonStringMetaDisplayFields', () => {
	it('removes object display fields without changing values or string display fields', () => {
		const value = { price: '45' };
		const input = {
			meta_data: [
				{
					key: '_woocommerce_pos_data',
					value,
					display_key: { label: 'POS data' },
					display_value: { price: '45' },
				},
				{ key: 'Size', value: 'L', display_key: 'Size', display_value: 'L' },
				null,
			],
		};

		const output = stripNonStringMetaDisplayFields(input);

		expect(output.meta_data).toEqual([
			{ key: '_woocommerce_pos_data', value },
			{ key: 'Size', value: 'L', display_key: 'Size', display_value: 'L' },
			null,
		]);
		expect(output.meta_data[0]?.value).toBe(value);
		expect(input.meta_data[0]).toHaveProperty('display_key');
		expect(input.meta_data[0]).toHaveProperty('display_value');
		expect(output).not.toBe(input);
		expect(output.meta_data).not.toBe(input.meta_data);
		expect(output.meta_data[1]).toBe(input.meta_data[1]);
	});

	it('strips nested meta_data from every order line collection', () => {
		const poison = () => ({
			meta_data: [{ key: 'Data', value: { kept: true }, display_value: { poison: true } }],
		});
		const input = {
			line_items: [poison()],
			shipping_lines: [poison()],
			fee_lines: [poison()],
			coupon_lines: [poison()],
			tax_lines: [poison()],
		};

		const output = stripNonStringMetaDisplayFields(input);

		for (const field of [
			'line_items',
			'shipping_lines',
			'fee_lines',
			'coupon_lines',
			'tax_lines',
		] as const) {
			expect(output[field][0].meta_data).toEqual([{ key: 'Data', value: { kept: true } }]);
			expect(input[field][0].meta_data[0]).toHaveProperty('display_value');
		}
	});

	it('leaves unsupported shapes unchanged', () => {
		const input = {
			meta_data: 'not-an-array',
			line_items: [null, { meta_data: 'not-an-array' }],
		};

		expect(stripNonStringMetaDisplayFields(input)).toBe(input);
	});
});
