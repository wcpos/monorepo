import * as React from 'react';

import map from 'lodash/map';
import sumBy from 'lodash/sumBy';
import { useObservableSuspense, useObservableState } from 'observable-hooks';

import useAuth from '../auth';
import { TaxesContext } from './provider';
import { calcTaxes, sumItemizedTaxes, sumTaxes } from './utils';

type LineItemDocument = import('@wcpos/database').LineItemDocument;
type FeeLineDocument = import('@wcpos/database').FeeLineDocument;
type ShippingLineDocument = import('@wcpos/database').ShippingLineDocument;
type CartItem = LineItemDocument | FeeLineDocument | ShippingLineDocument;
type Cart = CartItem[];
type TaxRateSchema = import('@wcpos/database').TaxRateSchema;
interface Taxes {
	id: number;
	total: string;
}

export const useTaxes = () => {
	const context = React.useContext(TaxesContext);
	if (!context) {
		throw new Error(`useTaxes must be called within TaxesContext`);
	}

	const rates = useObservableSuspense(context.resource);
	const { store } = useAuth();
	const _calcTaxes = useObservableState(store?.calc_taxes$, store?.calc_taxes);
	const pricesIncludeTax = useObservableState(
		store?.prices_include_tax$,
		store?.prices_include_tax
	);
	const taxRoundAtSubtotal = useObservableState(
		store?.tax_round_at_subtotal$,
		store?.tax_round_at_subtotal
	);

	/**
	 *
	 */
	const getDisplayValues = React.useCallback(
		(price: string | undefined, taxClass: string, taxDisplayShop: 'incl' | 'excl') => {
			const _taxClass = taxClass === '' ? 'standard' : taxClass; // default to standard
			const appliedRates =
				_calcTaxes === 'yes' ? rates.filter((rate) => rate.class === _taxClass) : [];
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
		[_calcTaxes, pricesIncludeTax, rates, taxRoundAtSubtotal]
	);

	/**
	 * Calculate line item totals
	 */
	const calcLineItemTotals = React.useCallback(
		(qty = 1, price = 0, taxClass) => {
			const _taxClass = taxClass === '' ? 'standard' : taxClass; // default to standard
			const appliedRates =
				_calcTaxes === 'yes' ? rates.filter((rate) => rate.class === _taxClass) : [];
			const discounts = 0;
			const subtotal = qty * price;
			const subtotalTaxes = calcTaxes(subtotal, rates);
			const itemizedSubTotalTaxes = sumItemizedTaxes(subtotalTaxes, taxRoundAtSubtotal);
			const total = subtotal - discounts;
			const totalTaxes = calcTaxes(subtotal, appliedRates, pricesIncludeTax === 'yes');
			const itemizedTotalTaxes = sumItemizedTaxes(totalTaxes, taxRoundAtSubtotal);
			// itemizedSubTotalTaxes & itemizedTotalTaxes should be same size
			// is there a case where they are not?
			const taxes = map(itemizedSubTotalTaxes, (obj) => {
				const index = itemizedTotalTaxes.findIndex((el) => el.id === obj.id);
				const totalTax = index !== -1 ? itemizedTotalTaxes[index] : { total: 0 };
				return {
					id: obj.id,
					subtotal: String(obj.total ?? 0),
					total: String(totalTax.total ?? 0),
				};
			});

			return {
				subtotal: String(subtotal),
				subtotal_tax: String(sumTaxes(subtotalTaxes, taxRoundAtSubtotal)),
				total: String(total),
				total_tax: String(sumTaxes(totalTaxes, taxRoundAtSubtotal)),
				taxes,
			};
		},
		[_calcTaxes, pricesIncludeTax, rates, taxRoundAtSubtotal]
	);

	/**
	 * Calc order totals
	 */
	const calcOrderTotals = React.useCallback(
		(lines: Cart) => {
			const total = sumBy(lines, (item) => +(item.total ?? 0));
			const totalTax = sumBy(lines, (item) => +(item.total_tax ?? 0));
			const totalWithTax = total + totalTax;
			const totalTaxString = String(totalTax);
			const totalWithTaxString = String(totalWithTax);
			const itemizedTaxes = sumItemizedTaxes(
				lines.map((line) => line.taxes ?? []),
				taxRoundAtSubtotal
			);
			const taxLines = itemizedTaxes.map((tax) => ({
				id: tax.id,
				tax_total: String(tax.total),
			}));

			return {
				total: totalWithTaxString,
				total_tax: totalTaxString,
				tax_lines: taxLines,
			};
		},
		[taxRoundAtSubtotal]
	);

	return { ...context, rates, getDisplayValues, calcLineItemTotals, calcOrderTotals };
};
