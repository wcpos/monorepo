import * as React from 'react';
import { useObservableSuspense, useObservableState } from 'observable-hooks';
import useAuth from '@wcpos/hooks/src/use-auth';
import { TaxesContext } from './provider';
import { calcTaxes, sumItemizedTaxes, sumTaxes } from './utils';

export const useTaxes = () => {
	const context = React.useContext(TaxesContext);
	if (!context) {
		throw new Error(`useTaxes must be called within TaxesContext`);
	}

	const rates = useObservableSuspense(context.resource);
	const { store } = useAuth();
	const pricesIncludeTax = useObservableState(
		store?.prices_include_tax$,
		store?.prices_include_tax
	);
	const taxRoundAtSubtotal = useObservableState(
		store?.tax_round_at_subtotal$,
		store?.tax_round_at_subtotal
	);

	const getDisplayValues = React.useCallback(
		(price: string | undefined, taxClass: string, taxDisplayShop: 'incl' | 'excl') => {
			const _taxClass = taxClass === '' ? 'standard' : taxClass; // default to standard
			const appliedRates = rates.filter((rate) => rate.class === _taxClass);
			const taxes = calcTaxes(price, appliedRates, pricesIncludeTax === 'yes');
			const itemizedTaxTotals = sumItemizedTaxes(taxes, taxRoundAtSubtotal);
			const taxTotal = sumTaxes(itemizedTaxTotals);
			let displayPrice = price;

			// pricesIncludeTax taxDisplayShop
			if (pricesIncludeTax === 'yes' && taxDisplayShop === 'excl') {
				displayPrice = +price - taxTotal;
			}

			if (pricesIncludeTax === 'no' && taxDisplayShop === 'incl') {
				displayPrice = +price + taxTotal;
			}

			return {
				displayPrice,
				taxTotal,
				taxDisplayShop,
			};
		},
		[pricesIncludeTax, rates, taxRoundAtSubtotal]
	);

	return { ...context, rates, getDisplayValues };
};
