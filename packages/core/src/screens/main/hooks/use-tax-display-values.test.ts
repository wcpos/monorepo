/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { useTaxDisplayValues } from './use-tax-display-values';
import { useTaxInclOrExcl } from './use-tax-incl-or-excl';
import { useTaxRates } from '../contexts/tax-rates';

jest.mock('./use-tax-incl-or-excl', () => ({ useTaxInclOrExcl: jest.fn() }));
jest.mock('../contexts/tax-rates', () => ({ useTaxRates: jest.fn() }));

it('uses the configured price decimals for display tax', () => {
	(useTaxRates as jest.Mock).mockReturnValue({
		rates: [
			{
				id: 1,
				rate: '5.0495',
				compound: false,
				order: 1,
				class: 'standard',
			},
		],
		calcTaxes: true,
		pricesIncludeTax: false,
		priceNumDecimals: 3,
	});
	(useTaxInclOrExcl as jest.Mock).mockReturnValue({ inclOrExcl: 'incl' });

	const { result } = renderHook(() =>
		useTaxDisplayValues({
			amount: 0.001,
			taxClass: 'standard',
			taxStatus: 'taxable',
			context: 'shop',
		})
	);

	expect(result.current.taxTotal).toBe(0.000050495);
});
