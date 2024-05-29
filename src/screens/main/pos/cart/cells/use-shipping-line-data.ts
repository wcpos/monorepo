import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { useAppState } from '../../../../../contexts/app-state';
import { useTaxCalculator } from '../../../hooks/taxes/use-tax-calculator';
import { getMetaDataValueByKey } from '../../hooks/utils';

type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];

/**
 *
 */
export const useShippingLineData = () => {
	const { store } = useAppState();
	const taxDisplayCart = useObservableEagerState(store.tax_display_cart$);
	const { calculateTaxesFromValue } = useTaxCalculator();
	const shippingTaxClass = useObservableEagerState(store.shipping_tax_class$);
	const pricesIncludeTax = useObservableEagerState(store.prices_include_tax$);

	/**
	 * Retrieves and processes the shipping line data.
	 */
	const getShippingLineData = React.useCallback(
		(item: ShippingLine) => {
			const defaultPricesIncludeTax = pricesIncludeTax === 'yes';
			const defaultTaxClass = shippingTaxClass === 'inherit' ? 'standard' : shippingTaxClass;
			const defaultAmount = defaultPricesIncludeTax
				? String(parseFloat(item.total) + parseFloat(item.total_tax))
				: item.total;
			const defaultTaxStatus = 'taxable';

			let amount = defaultAmount;
			let tax_status = defaultTaxStatus;
			let tax_class = defaultTaxClass;
			let prices_include_tax = defaultPricesIncludeTax;

			try {
				const posData = getMetaDataValueByKey(item.meta_data, '_woocommerce_pos_data');
				if (posData) {
					const parsedData = JSON.parse(posData);
					({
						amount = defaultAmount,
						tax_status = defaultTaxStatus,
						tax_class = defaultTaxClass,
						prices_include_tax = defaultPricesIncludeTax,
					} = parsedData);
				}
			} catch (error) {
				console.error('Error parsing posData:', error);
			}

			return {
				amount,
				tax_status,
				tax_class,
				prices_include_tax,
			};
		},
		[pricesIncludeTax, shippingTaxClass]
	);

	/**
	 * Calculates the display price for a shipping line item.
	 */
	const getShippingLineDisplayPrice = React.useCallback(
		(item: ShippingLine) => {
			const { amount, tax_status, tax_class, prices_include_tax } = getShippingLineData(item);

			let displayPrice = amount;

			// mismatched tax settings
			if (taxDisplayCart === 'excl' && prices_include_tax) {
				const taxes = calculateTaxesFromValue({
					value: amount,
					taxStatus: tax_status,
					taxClass: tax_class,
					valueIncludesTax: true,
				});

				displayPrice = String(parseFloat(amount) - taxes.total);
			}

			// mismatched tax settings
			if (taxDisplayCart === 'incl' && !prices_include_tax) {
				const taxes = calculateTaxesFromValue({
					value: amount,
					taxStatus: tax_status,
					taxClass: tax_class,
					valueIncludesTax: true,
				});

				displayPrice = String(parseFloat(amount) + taxes.total);
			}

			return displayPrice;
		},
		[calculateTaxesFromValue, getShippingLineData, taxDisplayCart]
	);

	return {
		getShippingLineData,
		getShippingLineDisplayPrice,
	};
};
