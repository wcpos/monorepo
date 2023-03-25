import * as React from 'react';

import round from 'lodash/round';
import sumBy from 'lodash/sumBy';
import { useObservableState } from 'observable-hooks';

import { calcTaxes, sumItemizedTaxes, sumTaxes } from './utils';
import useLocalData from '../../../../contexts/local-data';
import useTaxRates from '../../contexts/tax-rates';

type LineItemDocument = import('@wcpos/database').LineItemDocument;
type FeeLineDocument = import('@wcpos/database').FeeLineDocument;
type ShippingLineDocument = import('@wcpos/database').ShippingLineDocument;
type CartItem = LineItemDocument | FeeLineDocument | ShippingLineDocument;
type Cart = CartItem[];

const useTaxCalculation = () => {
	const { data: rates } = useTaxRates();
	const { store } = useLocalData();
	if (!store) {
		throw new Error('Store is not defined');
	}
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
			const _price = price ? parseFloat(price) : 0;
			const _taxClass = taxClass === '' ? 'standard' : taxClass; // default to standard
			const appliedRates =
				_calcTaxes === 'yes' ? rates.filter((rate) => rate.class === _taxClass) : [];
			const taxes = calcTaxes(_price, appliedRates, pricesIncludeTax === 'yes');
			const itemizedTaxTotals = sumItemizedTaxes(taxes, taxRoundAtSubtotal === 'yes');
			const taxTotal = sumTaxes(itemizedTaxTotals);
			let displayPrice = price;

			/**
			 * _price - taxTotal can end up with weird results
			 * 100 - 16.6667 = 83.33330000000001
			 * I am rounding to 4 decimal places here
			 */
			if (pricesIncludeTax === 'yes' && taxDisplayShop === 'excl') {
				displayPrice = String(round(_price - taxTotal, 4));
			}

			if (pricesIncludeTax === 'no' && taxDisplayShop === 'incl') {
				displayPrice = String(round(_price + taxTotal, 4));
			}

			return {
				displayPrice,
				taxTotal: String(taxTotal),
				taxDisplayShop,
			};
		},
		[_calcTaxes, pricesIncludeTax, rates, taxRoundAtSubtotal]
	);

	/**
	 * Calculate line item totals
	 */
	const calcLineItemTotals = React.useCallback(
		(qty = 1, price = '0', taxClass = '', taxStatus: string) => {
			const _taxClass = taxClass === '' ? 'standard' : taxClass; // default to standard
			let appliedRates = rates.filter((rate) => rate.class === _taxClass);
			if (taxStatus === 'none') {
				appliedRates = [];
			}
			if (_calcTaxes === 'no') {
				appliedRates = [];
			}
			const discounts = 0;
			const subtotal = qty * parseFloat(price);
			const subtotalTaxes = calcTaxes(subtotal, appliedRates);
			const itemizedSubTotalTaxes = sumItemizedTaxes(subtotalTaxes, taxRoundAtSubtotal === 'yes');
			const total = subtotal - discounts;
			const totalTaxes = calcTaxes(subtotal, appliedRates, pricesIncludeTax === 'yes');
			const itemizedTotalTaxes = sumItemizedTaxes(totalTaxes, taxRoundAtSubtotal === 'yes');
			// itemizedSubTotalTaxes & itemizedTotalTaxes should be same size
			// is there a case where they are not?
			const taxes = itemizedSubTotalTaxes.map((obj) => {
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
				subtotal_tax: String(sumTaxes(subtotalTaxes, taxRoundAtSubtotal === 'yes')),
				total: String(total),
				total_tax: String(sumTaxes(totalTaxes, taxRoundAtSubtotal === 'yes')),
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
				// @ts-ignore
				lines.map((line) => line.taxes ?? []),
				taxRoundAtSubtotal
			);

			/**
			 * line_item.taxes don't have label, we need to add back it here
			 */
			const taxLines = itemizedTaxes.map((tax) => {
				const taxRate = rates.find((rate) => rate.id === String(tax.id));
				return {
					rate_id: tax.id,
					// rate_code: ??,
					label: taxRate?.name,
					compound: taxRate?.compound,
					tax_total: String(tax.total),
				};
			});

			return {
				total: totalWithTaxString,
				total_tax: totalTaxString,
				tax_lines: taxLines,
			};
		},
		[taxRoundAtSubtotal, rates]
	);

	return {
		getDisplayValues,
		calcLineItemTotals,
		calcOrderTotals,
	};
};

export default useTaxCalculation;
