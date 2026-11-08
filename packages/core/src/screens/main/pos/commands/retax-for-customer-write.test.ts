import { wooMetaCarrier } from '@wcpos/sync-core';

import { config as baseConfig } from '../../../../../jest/cart-write';
import { cartConfigForOrder, type OrderPayload } from './cart-config-for-order';
import { retaxForCustomerWrite } from './retax-for-customer-write';

const rates = [
	{ id: 1, country: 'AU', rate: '10', class: 'standard', shipping: true, priority: 1 },
	{ id: 2, country: 'NZ', rate: '15', class: 'standard', shipping: true, priority: 1 },
];
const configForOrder = (order: OrderPayload) =>
	cartConfigForOrder({
		settings: { ...baseConfig, calcTaxes: true, priceNumDecimals: 2, taxBasedOn: 'shipping' },
		rates,
		baseLocation: { country: 'AU' },
		order,
	} as never);
const line = {
	product_id: 1,
	quantity: 1,
	subtotal: '100',
	total: '100',
	subtotal_tax: '10',
	total_tax: '10',
	taxes: [{ id: 1, total: '10', subtotal: '10' }],
};
const order = (overrides: OrderPayload = {}) =>
	({
		status: 'pos-open',
		billing: { first_name: 'Ada', country: 'AU' },
		shipping: { first_name: 'Ada', country: 'AU' },
		line_items: [line],
		...overrides,
	}) as OrderPayload;
const deps = { configForOrder, ownedElsewhere: false, taxStatusFor: () => undefined };
const toNZ = { billing: { country: 'NZ' }, shipping: { country: 'NZ' } };

it('re-taxes a line at the new address rate and leaves its ex-tax money alone', () => {
	const { lines, warnings } = retaxForCustomerWrite(order(), toNZ, deps);
	expect(lines.line_items).toEqual([
		{
			...line,
			total_tax: '15',
			subtotal_tax: '15',
			taxes: [{ id: 2, total: '15.000000', subtotal: '15.000000' }],
		},
	]);
	expect(warnings).toEqual([]);
	expect(lines).not.toHaveProperty('fee_lines');
});

// Stored tax no rate set reproduces: only the rate guard keeps it from being rewritten.
const stale = {
	...line,
	total_tax: '9',
	subtotal_tax: '9',
	taxes: [{ id: 1, total: '9', subtotal: '9' }],
};

it('rewrites nothing when the rates do not move', () => {
	const intent = { billing: { first_name: 'Grace', country: 'AU' }, shipping: order().shipping };
	const current = order({ line_items: [stale] });
	expect(retaxForCustomerWrite(current, intent, deps).lines).toEqual({});
});

it('an undefined address keeps the current one, so it moves no rate', () => {
	// No shipping country: the tax address is the billing one, and the store base is AU.
	const current = order({
		billing: { country: 'NZ' },
		shipping: { country: '' },
		line_items: [stale],
	});
	const intent = { billing: undefined, shipping: { first_name: 'Grace', country: '' } };
	expect(retaxForCustomerWrite(current, intent, deps).lines).toEqual({});
});

it('leaves the lines to the server when it owns the money or a settlement leg is live', () => {
	expect(retaxForCustomerWrite(order(), toNZ, { ...deps, ownedElsewhere: true })).toEqual({
		lines: {},
		warnings: [],
	});
	const hint = order({ meta_data: [{ key: '_wcpos_money_owner_hint', value: 'server' }] });
	expect(retaxForCustomerWrite(hint, toNZ, deps).lines).toEqual({});
	const leg = order({
		meta_data: [
			{
				key: '_wcpos_payments',
				value: {
					schema: 1,
					payments: [{ id: 'leg', status: 'pending', amount: '110', refunded_amount: '0' }],
				},
			},
		],
	} as never);
	expect(retaxForCustomerWrite(leg, toNZ, deps).lines).toEqual({});
});

it('a non-taxable product stays at zero tax under the new rates', () => {
	const zero = { ...line, product_id: 2, subtotal_tax: '0', total_tax: '0', taxes: [] };
	const { lines } = retaxForCustomerWrite(order({ line_items: [line, zero] }), toNZ, {
		...deps,
		taxStatusFor: (l) => (l.product_id === 2 ? 'none' : undefined),
	});
	expect(lines.line_items?.[0].total_tax).toBe('15');
	expect(lines.line_items?.[1]).toEqual(zero);
});

it('re-taxes a fixed fee and leaves a percent fee to settlement', () => {
	const fee = {
		name: 'Handling',
		total: '5',
		tax_status: 'taxable',
		tax_class: '',
		total_tax: '0.5',
		taxes: [{ id: 1, total: '0.5' }],
	};
	const percent = {
		...fee,
		name: 'Service',
		meta_data: [{ key: '_woocommerce_pos_data', value: { percent: 'true' } }],
	};
	const { lines } = retaxForCustomerWrite(
		order({ fee_lines: [fee, percent] } as never),
		toNZ,
		deps
	);
	expect(lines.fee_lines?.[0]).toMatchObject({
		total: '5',
		total_tax: '0.75',
		taxes: [{ id: 2, total: '0.75' }],
	});
	expect(lines.fee_lines?.[1]).toEqual(percent);
});

it('a coupon-discounted line takes total tax from its total and subtotal tax from its subtotal', () => {
	const discounted = {
		...line,
		total: '80',
		total_tax: '8',
		taxes: [{ id: 1, total: '8', subtotal: '10' }],
	};
	const { lines } = retaxForCustomerWrite(order({ line_items: [discounted] }), toNZ, deps);
	expect(lines.line_items?.[0]).toMatchObject({
		subtotal: '100',
		total: '80',
		subtotal_tax: '15',
		total_tax: '12',
		taxes: [{ id: 2, total: '12.000000', subtotal: '15.000000' }],
	});
});

describe('a server-flagged exempt order keeps its lines (roadmap#477)', () => {
	const zero = { ...line, subtotal_tax: '0', total_tax: '0', taxes: [] };
	const exempt = order({
		line_items: [zero],
		meta_data: wooMetaCarrier.stampVatExempt([], true),
	} as never);

	it('on an inclusive store, where the config does not carry the flag', () => {
		const inclusive = (o: OrderPayload) =>
			cartConfigForOrder({
				settings: {
					...baseConfig,
					calcTaxes: true,
					priceNumDecimals: 2,
					pricesIncludeTax: true,
					taxBasedOn: 'shipping',
				},
				rates,
				baseLocation: { country: 'AU' },
				order: o,
			} as never);
		expect(inclusive(exempt).vatExempt).toBe(false);
		const { lines } = retaxForCustomerWrite(exempt, toNZ, { ...deps, configForOrder: inclusive });
		expect(lines).toEqual({});
	});

	it('on an exclusive store', () => {
		expect(retaxForCustomerWrite(exempt, toNZ, deps).lines).toEqual({});
	});
});
