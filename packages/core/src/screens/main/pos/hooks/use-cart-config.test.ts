/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { useCartConfig } from './use-cart-config';

let mockShippingTaxClass: string | undefined;

jest.mock('@wcpos/query', () => ({
	useDocField: (
		_document: unknown,
		selector: (store: {
			woocommerce_calc_discounts_sequentially?: string;
			calc_discounts_sequentially?: string;
		}) => unknown
	) =>
		selector({
			woocommerce_calc_discounts_sequentially: 'no',
			calc_discounts_sequentially: 'no',
		}),
}));

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: {} }),
}));

jest.mock('../../contexts/tax-rates', () => {
	// Held in the factory closure so the arrays keep their identity across renders,
	// as the real provider's memos do. Rebuilding them here would make this suite
	// unable to tell a stable memo from a broken one.
	const rates: unknown[] = [];
	const allRates: unknown[] = [];
	return {
		useTaxLocation: () => ({ rates }),
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
