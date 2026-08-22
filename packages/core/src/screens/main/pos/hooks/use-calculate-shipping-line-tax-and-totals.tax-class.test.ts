/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { useCalculateShippingLineTaxAndTotals } from './use-calculate-shipping-line-tax-and-totals';

let mockShippingTaxClass: string | undefined;

jest.mock('@wcpos/query', () => ({
	useDocField: (
		_document: unknown,
		selector: (store: { prices_include_tax: string; shipping_tax_class?: string }) => unknown
	) =>
		selector({
			prices_include_tax: 'no',
			shipping_tax_class: mockShippingTaxClass,
		}),
}));

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: {} }),
}));

jest.mock('../../contexts/tax-rates', () => ({
	useTaxSettings: () => ({
		pricesIncludeTax: false,
		priceNumDecimals: 2,
		taxRoundAtSubtotal: false,
	}),
	useTaxRates: () => ({
		rates: [
			{
				id: 101,
				class: 'standard',
				rate: '10.0000',
				compound: false,
				order: 1,
				shipping: true,
			},
			{
				id: 202,
				class: 'reduced-rate',
				rate: '5.0000',
				compound: false,
				order: 1,
				shipping: true,
			},
		],
		calcTaxes: true,
		pricesIncludeTax: false,
		priceNumDecimals: 2,
	}),
}));

describe('shipping tax class contract', () => {
	it.each([
		['standard', 101, '10'],
		['', 101, '10'],
		['reduced-rate', 202, '5'],
		[undefined, 101, '10'],
	])(
		'applies the matching rate when the store shipping_tax_class is %p',
		(shippingTaxClass, expectedRateId, expectedTax) => {
			mockShippingTaxClass = shippingTaxClass;
			const { result } = renderHook(() => useCalculateShippingLineTaxAndTotals());

			const shippingLine = result.current.calculateShippingLineTaxesAndTotals({
				method_title: 'Flat rate',
				total: '100',
				total_tax: '0',
			});

			expect(shippingLine.total_tax).toBe(expectedTax);
			expect(shippingLine.taxes).toEqual([{ id: expectedRateId, total: expectedTax }]);
		}
	);
});
