/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { renderHook } from '@testing-library/react';

import { CartConfigProvider, useCartConfig, useCartConfigReader } from './use-cart-config';
import { cartConfigForOrder, orderTaxLocation } from '../commands/cart-config-for-order';
let mockOrder: { payload: Record<string, unknown> } | undefined;
let mockTaxBasedOn = 'billing';
let mockLocationVatExempt = false;
jest.mock('../contexts/current-order/context', () => ({
	useCurrentOrderOptional: () => mockOrder,
}));

let mockShippingTaxClass: string | undefined;

jest.mock('@wcpos/query', () => ({
	useRecordField: (
		record: typeof mockOrder,
		selector: (record: NonNullable<typeof mockOrder>) => unknown
	) => record && selector(record),
	useDocField: (
		_document: unknown,
		selector: (doc: {
			woocommerce_calc_discounts_sequentially?: string;
			calc_discounts_sequentially?: string;
			taxClasses?: { slug: string }[];
			tax_based_on?: string;
			store_country?: string;
		}) => unknown
	) =>
		selector({
			tax_based_on: mockTaxBasedOn,
			store_country: 'AU',
			woocommerce_calc_discounts_sequentially: 'no',
			calc_discounts_sequentially: 'no',
			// The `wc/v3 taxes/classes` shape, standard first — the 'inherit' candidate order.
			taxClasses: [{ slug: 'standard' }, { slug: 'reduced-rate' }, { slug: 'zero-rate' }],
		}),
}));

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: {} }),
}));

jest.mock('../../contexts/extra-data/use-extra-data', () => ({
	useExtraData: () => ({ extraData: {} }),
}));

jest.mock('../../contexts/tax-rates', () => {
	// Held in the factory closure so the arrays keep their identity across renders,
	// as the real provider's memos do. Rebuilding them here would make this suite
	// unable to tell a stable memo from a broken one.
	const location = { country: 'AU', state: '', city: '', postcode: '' };
	const allRates = [
		{ id: 1, country: 'AU', rate: '10', class: 'standard' },
		{ id: 2, country: 'NZ', rate: '15', class: 'standard' },
	];
	return {
		useTaxLocation: () => {
			Object.assign(
				location,
				orderTaxLocation({ country: 'AU' }, mockTaxBasedOn, mockOrder?.payload).location
			);
			return {
				location,
				hasOrder: Boolean(mockOrder),
				vatExempt: mockLocationVatExempt,
			};
		},
		useTaxSettings: () => ({
			allRates,
			shippingTaxClass: mockShippingTaxClass,
			calcTaxes: true,
			taxRoundAtSubtotal: false,
			priceNumDecimals: 2,
			pricesIncludeTax: false,
		}),
	};
});

/**
 * Migrated from use-calculate-shipping-line-tax-and-totals.tax-class.test.ts, which
 * pinned this contract through the retired hook. The store spells the standard class
 * three different ways depending on where the value came from; the engine's rate
 * filter only matches the wire spelling, so the normalisation has to happen exactly
 * once, here. The other half of the contract — that the wire value then selects the
 * right rate — is pinned by cart-line.test.ts's "shipping tax class contract".
 */
describe('useCartConfig — shipping tax class normalisation', () => {
	it.each([
		['standard', ''],
		['', ''],
		[undefined, ''],
		['reduced-rate', 'reduced-rate'],
		// WooCommerce's "same as the cart" sentinel is NOT the standard class and must
		// survive the round-trip intact — the engine's extract step is what maps it.
		['inherit', 'inherit'],
	])('normalises a store shipping_tax_class of %p to %p', (storeValue, expected) => {
		mockShippingTaxClass = storeValue;

		const { result } = renderHook(() => useCartConfig());

		expect(result.current.shippingTaxClass).toBe(expected);
	});
});

describe('useCartConfig — identity', () => {
	it('returns the same frozen config across re-renders with unchanged settings', () => {
		mockShippingTaxClass = 'standard';

		const { result, rerender } = renderHook(() => useCartConfig());
		const first = result.current;
		rerender();

		// Load-bearing: the settlement subscription takes the config as an input, so a
		// fresh object every render would re-arm it every render.
		expect(result.current).toBe(first);
		expect(Object.isFrozen(first)).toBe(true);
	});
});

it.each(['billing', 'shipping', 'base', 'override', 'fallback'])(
	'matches the pure builder for %s',
	(basis) => {
		mockTaxBasedOn = basis === 'override' ? 'billing' : basis;
		mockShippingTaxClass = 'standard';
		mockOrder = {
			payload: {
				billing: { country: 'AU' },
				shipping: { country: 'NZ' },
				meta_data:
					basis === 'override' ? [{ key: '_woocommerce_pos_tax_based_on', value: 'shipping' }] : [],
			},
		};
		if (basis === 'fallback') mockOrder = undefined;
		const { result } = renderHook(() => useCartConfig());
		expect(result.current.rates.map((rate) => rate.id)).toEqual([
			basis === 'shipping' || basis === 'override' ? 2 : 1,
		]);
		expect(result.current).toEqual(
			cartConfigForOrder({
				settings: {
					taxBasedOn: mockTaxBasedOn,
					calcTaxes: true,
					pricesIncludeTax: false,
					taxRoundAtSubtotal: false,
					priceNumDecimals: 2,
					shippingTaxClass: 'standard',
					taxClassSlugs: ['standard', 'reduced-rate', 'zero-rate'],
					calcDiscountsSequentially: false,
				},
				rates: [
					{ id: 1, country: 'AU', rate: '10', class: 'standard' },
					{ id: 2, country: 'NZ', rate: '15', class: 'standard' },
				],
				baseLocation: { country: 'AU' },
				order: mockOrder?.payload,
			})
		);
	}
);

it('the session reader uses the target order latest exemption, not the displayed order', () => {
	mockOrder = { payload: { meta_data: [{ key: 'is_vat_exempt', value: 'no' }] } };
	const { result } = renderHook(() => useCartConfigReader(), {
		wrapper: ({ children }) => React.createElement(CartConfigProvider, null, children),
	});
	const payload = { meta_data: [{ key: 'is_vat_exempt', value: 'no' }] };
	expect(result.current(payload).vatExempt).toBe(false);
	payload.meta_data[0].value = 'yes';
	expect(result.current(payload).vatExempt).toBe(true);
});

it('render-time config agrees with the location context exemption', () => {
	mockLocationVatExempt = true;
	expect(renderHook(() => useCartConfig()).result.current.vatExempt).toBe(true);
});
