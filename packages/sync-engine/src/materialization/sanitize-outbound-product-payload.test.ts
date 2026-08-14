import { describe, expect, it } from 'vitest';

import { sanitizeOutboundProductPayload } from './sanitize-outbound-product-payload';

describe('sanitizeOutboundProductPayload', () => {
	it('drops the live-probe null COGS block that WooCommerce rejects on write (#489)', () => {
		const output = sanitizeOutboundProductPayload({
			name: 'Coffee',
			cost_of_goods_sold: {
				values: [{ defined_value: null, effective_value: 0 }],
				total_value: 0,
			},
		});

		expect(output).toEqual({ name: 'Coffee' });
		expect(output).not.toHaveProperty('cost_of_goods_sold');
	});

	it('keeps a genuine cashier COGS edit untouched, including identity', () => {
		const input = {
			cost_of_goods_sold: {
				total_value: 0,
				values: [{ defined_value: 5, effective_value: 0 }],
			},
		};

		expect(sanitizeOutboundProductPayload(input)).toBe(input);
	});

	it('drops a null entry while keeping a number entry', () => {
		const output = sanitizeOutboundProductPayload({
			cost_of_goods_sold: {
				values: [
					{ defined_value: null, effective_value: 0 },
					{ defined_value: 7, effective_value: 7 },
				],
				total_value: 7,
			},
		});

		expect(output.cost_of_goods_sold).toEqual({
			values: [{ defined_value: 7, effective_value: 7 }],
			total_value: 7,
		});
	});

	it('keeps a valid entry but omits a non-number effective value', () => {
		const output = sanitizeOutboundProductPayload({
			cost_of_goods_sold: {
				values: [{ defined_value: 5, effective_value: null }],
				total_value: 5,
			},
		});

		expect(output.cost_of_goods_sold).toEqual({
			values: [{ defined_value: 5 }],
			total_value: 5,
		});
	});

	it('omits a non-number total value alongside a valid entry', () => {
		const output = sanitizeOutboundProductPayload({
			cost_of_goods_sold: {
				values: [{ defined_value: 5, effective_value: 5 }],
				total_value: null,
			},
		});

		expect(output.cost_of_goods_sold).toEqual({
			values: [{ defined_value: 5, effective_value: 5 }],
		});
	});

	it('returns the same reference without a usable COGS object and values array', () => {
		const absent = { name: 'Coffee' };
		const nonObject = { cost_of_goods_sold: null };
		const nonArrayValues = { cost_of_goods_sold: { values: null } };

		expect(sanitizeOutboundProductPayload(absent)).toBe(absent);
		expect(sanitizeOutboundProductPayload(nonObject)).toBe(nonObject);
		expect(sanitizeOutboundProductPayload(nonArrayValues)).toBe(nonArrayValues);
	});

	it('does not mutate the input', () => {
		const input = {
			name: 'Coffee',
			cost_of_goods_sold: {
				values: [
					{ defined_value: null, effective_value: 0 },
					{ defined_value: 5, effective_value: null },
				],
				total_value: null,
			},
		};
		const original = structuredClone(input);

		sanitizeOutboundProductPayload(input);

		expect(input).toEqual(original);
	});
});
