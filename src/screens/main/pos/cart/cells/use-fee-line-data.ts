import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { useAppState } from '../../../../../contexts/app-state';
import { useTaxCalculator } from '../../../hooks/taxes/use-tax-calculator';
import { getMetaDataValueByKey } from '../../hooks/utils';

type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];

/**
 *
 */
export const useFeeLineData = () => {
	const { store } = useAppState();
	const taxDisplayCart = useObservableEagerState(store.tax_display_cart$);
	const { calculateTaxesFromValue } = useTaxCalculator();
	const pricesIncludeTax = useObservableEagerState(store.prices_include_tax$);

	/**
	 * Retrieves and processes the fee line data.
	 */
	const getFeeLineData = React.useCallback(
		(item: FeeLine) => {
			const defaultPricesIncludeTax = pricesIncludeTax === 'yes';
			const defaultPercent = false;
			const defaultAmount = defaultPricesIncludeTax
				? String(parseFloat(item.total) + parseFloat(item.total_tax))
				: item.total;

			let amount = defaultAmount;
			let percent = defaultPercent;
			let prices_include_tax = defaultPricesIncludeTax;

			try {
				const posData = getMetaDataValueByKey(item.meta_data, '_woocommerce_pos_data');
				if (posData) {
					const parsedData = JSON.parse(posData);
					({
						amount = defaultAmount,
						percent = defaultPercent,
						prices_include_tax = defaultPricesIncludeTax,
					} = parsedData);
				}
			} catch (error) {
				console.error('Error parsing posData:', error);
			}

			return {
				amount,
				percent,
				prices_include_tax,
			};
		},
		[pricesIncludeTax]
	);

	/**
	 * Calculates the display price for a fee line item.
	 */
	const getFeeLineDisplayPrice = React.useCallback(
		(item: FeeLine) => {
			const { amount, prices_include_tax } = getFeeLineData(item);

			let displayPrice = amount;

			// mismatched tax settings
			if (taxDisplayCart === 'excl' && prices_include_tax) {
				const taxes = calculateTaxesFromValue({
					value: amount,
					taxStatus: item.tax_status,
					taxClass: item.tax_class,
					valueIncludesTax: true,
				});

				displayPrice = String(parseFloat(amount) - taxes.total);
			}

			// mismatched tax settings
			if (taxDisplayCart === 'incl' && !prices_include_tax) {
				const taxes = calculateTaxesFromValue({
					value: amount,
					taxStatus: item.tax_status,
					taxClass: item.tax_class,
					valueIncludesTax: true,
				});

				displayPrice = String(parseFloat(amount) + taxes.total);
			}

			return displayPrice;
		},
		[calculateTaxesFromValue, getFeeLineData, taxDisplayCart]
	);

	return {
		getFeeLineData,
		getFeeLineDisplayPrice,
	};
};
