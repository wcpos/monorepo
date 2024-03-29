import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { useAppState } from '../../../../contexts/app-state';
import { useTaxHelpers } from '../../contexts/tax-helpers';
import { calculateLineItemTotals } from '../../contexts/tax-helpers/utils';

type TaxRateDocument = import('@wcpos/database').TaxRateDocument;

/**
 * Calculate line item totals
 *
 * @TODO - this is a duplicate of the function in tax-helpers/utils.ts, why is this here?
 */
// function calculateLineItemTotals({
// 	quantity,
// 	price,
// 	total,
// 	rates,
// 	pricesIncludeTax,
// 	taxRoundAtSubtotal,
// }: {
// 	quantity: number;
// 	price: string;
// 	total: string;
// 	rates: TaxRateDocument[];
// 	pricesIncludeTax: boolean;
// 	taxRoundAtSubtotal: boolean;
// }) {
// 	// Subtotal
// 	const priceAsFloat = parseFloat(price);
// 	const subtotal = quantity * priceAsFloat;
// 	const subtotalTaxes = calculateTaxes(subtotal, rates);
// 	const itemizedSubTotalTaxes = sumItemizedTaxes(subtotalTaxes, taxRoundAtSubtotal);

// 	// Total
// 	const totalTaxes = calculateTaxes(parseFloat(total), rates);
// 	const itemizedTotalTaxes = sumItemizedTaxes(totalTaxes, taxRoundAtSubtotal);
// 	const taxes = itemizedSubTotalTaxes.map((obj) => {
// 		const index = itemizedTotalTaxes.findIndex((el) => el.id === obj.id);
// 		const totalTax = index !== -1 ? itemizedTotalTaxes[index] : { total: 0 };
// 		return {
// 			id: obj.id,
// 			subtotal: String(obj.total ?? 0),
// 			total: String(totalTax.total ?? 0),
// 		};
// 	});

// 	return {
// 		subtotal: String(subtotal),
// 		subtotal_tax: String(sumTaxes(subtotalTaxes, taxRoundAtSubtotal)),
// 		total: String(total),
// 		total_tax: String(sumTaxes(totalTaxes, taxRoundAtSubtotal)),
// 		taxes,
// 	};
// }

/**
 *
 */
export const useShippingTaxCalculation = () => {
	const { store } = useAppState();
	const shippingTaxClass = useObservableState(store.shipping_tax_class$, store.shipping_tax_class);
	const { calcTaxes, rates, taxRoundAtSubtotal } = useTaxHelpers();

	/**
	 * TODO - I need to test this against WC unit tests to make sure it's correct
	 * see the WC_Tax::get_shipping_tax_rates() method for more details
	 *
	 * Here we are using any tax rate that has the shipping flag set to true
	 * unless the shipping tax class is set, in which case we use that.
	 * If no tax rates are found, we use the standard tax class.
	 */
	const calculateShippingLineTaxes = React.useCallback(
		({ total }) => {
			let appliedRates = rates.filter((rate) => rate.shipping === true);
			if (shippingTaxClass) {
				appliedRates = rates.filter((rate) => rate.class === shippingTaxClass);
			}

			if (appliedRates.length === 0) {
				appliedRates = rates.filter((rate) => rate.class === 'standard');
			}

			// early return if no taxes
			if (!calcTaxes || appliedRates.length === 0) {
				return {
					total,
					total_tax: '0',
					taxes: [],
				};
			}

			const shippingLineTotals = calculateLineItemTotals({
				quantity: 1,
				price: total,
				total,
				rates: appliedRates,
				pricesIncludeTax: false, // shipping is always exclusive
				taxRoundAtSubtotal,
			});

			// shipping (like fee) has subtotal set to '' in the WC REST API
			const updatedTaxes = shippingLineTotals.taxes.map((tax) => ({
				...tax,
				subtotal: '',
			}));

			const result = {
				total: shippingLineTotals.total,
				total_tax: shippingLineTotals.total_tax,
				taxes: updatedTaxes,
			};

			return result;
		},
		[calcTaxes, rates, shippingTaxClass, taxRoundAtSubtotal]
	);

	return {
		calculateShippingLineTaxes,
	};
};
