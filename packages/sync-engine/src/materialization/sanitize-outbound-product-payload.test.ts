import { describe, expect, it } from 'vitest';

import { sanitizeOutboundProductPayload } from './sanitize-outbound-product-payload';

describe('sanitizeOutboundProductPayload', () => {
	it('drops an empty low_stock_amount', () => {
		const output = sanitizeOutboundProductPayload({ low_stock_amount: '' });

		expect(output).not.toHaveProperty('low_stock_amount');
	});

	it('coerces a numeric low_stock_amount string to an integer', () => {
		const output = sanitizeOutboundProductPayload({ low_stock_amount: '5' });

		expect(output.low_stock_amount).toBe(5);
	});

	it.each([5, null])('keeps writable low_stock_amount %s unchanged', (lowStockAmount) => {
		const output = sanitizeOutboundProductPayload({ low_stock_amount: lowStockAmount });

		expect(output.low_stock_amount).toBe(lowStockAmount);
	});

	it('leaves low_stock_amount absent when it is not in the input', () => {
		const output = sanitizeOutboundProductPayload({ name: 'Probe' });

		expect(output).not.toHaveProperty('low_stock_amount');
	});

	it('drops cost_of_goods_sold when defined_value is null', () => {
		const output = sanitizeOutboundProductPayload({
			name: 'Probe',
			cost_of_goods_sold: {
				values: [{ defined_value: null, effective_value: 0 }],
				total_value: 0,
			},
		});

		expect(output).not.toHaveProperty('cost_of_goods_sold');
	});

	it.each([0, 8.5])('keeps finite defined_value %s and drops read-only fields', (value) => {
		const output = sanitizeOutboundProductPayload({
			cost_of_goods_sold: {
				values: [{ defined_value: value, effective_value: value }],
				total_value: value,
			},
		});

		expect(output.cost_of_goods_sold).toEqual({
			values: [{ defined_value: value }],
		});
	});

	it.each([true, false])('keeps variation defined_value_is_additive %s', (isAdditive) => {
		const output = sanitizeOutboundProductPayload({
			cost_of_goods_sold: {
				values: [{ defined_value: 8, effective_value: 12 }],
				total_value: 12,
				defined_value_is_additive: isAdditive,
			},
		});

		expect(output.cost_of_goods_sold).toEqual({
			values: [{ defined_value: 8 }],
			defined_value_is_additive: isAdditive,
		});
	});

	it('keeps only finite numeric values', () => {
		const output = sanitizeOutboundProductPayload({
			cost_of_goods_sold: {
				values: [
					{ defined_value: Number.NaN },
					{ defined_value: Number.POSITIVE_INFINITY },
					{ defined_value: 4 },
				],
			},
		});

		expect(output.cost_of_goods_sold).toEqual({
			values: [{ defined_value: 4 }],
		});
	});

	it('returns the input unchanged when cost_of_goods_sold is absent', () => {
		const input = { name: 'Probe' };

		expect(sanitizeOutboundProductPayload(input)).toBe(input);
	});

	it.each([null, [], 'invalid', new Date()])(
		'returns the input unchanged when cost_of_goods_sold is not a plain object',
		(costOfGoodsSold) => {
			const input = { cost_of_goods_sold: costOfGoodsSold };

			expect(sanitizeOutboundProductPayload(input)).toBe(input);
		}
	);

	it('leaves other fields untouched', () => {
		const details = { name: 'Probe', sku: 'probe-sku' };
		const output = sanitizeOutboundProductPayload({
			details,
			cost_of_goods_sold: { values: [{ defined_value: 2 }] },
		});

		expect(output.details).toBe(details);
	});

	it('does not mutate the input', () => {
		const input = {
			name: 'Probe',
			cost_of_goods_sold: {
				values: [{ defined_value: 3, effective_value: 4 }],
				total_value: 4,
			},
		};
		const snapshot = structuredClone(input);

		sanitizeOutboundProductPayload(input);

		expect(input).toEqual(snapshot);
	});
});
