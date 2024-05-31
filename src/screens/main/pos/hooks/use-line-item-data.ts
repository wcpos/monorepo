import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { getMetaDataValueByKey } from './utils';
import { useAppState } from '../../../../contexts/app-state';
import { useTaxCalculator } from '../../hooks/taxes/use-tax-calculator';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];

/**
 *
 */
export const useLineItemData = () => {
	const { store } = useAppState();
	const { calculateTaxesFromValue } = useTaxCalculator();
	const pricesIncludeTax = useObservableEagerState(store.prices_include_tax$);

	/**
	 * Retrieves and processes the fee line data.
	 */
	const getLineItemData = React.useCallback(
		(item: LineItem) => {
			const defaultPricesIncludeTax = pricesIncludeTax === 'yes';
			const defaultPrice = defaultPricesIncludeTax
				? String((parseFloat(item.total) + parseFloat(item.total_tax)) / item.quantity)
				: String(parseFloat(item.total) / item.quantity);
			const defaultRegularPrice = defaultPricesIncludeTax
				? String((parseFloat(item.subtotal) + parseFloat(item.subtotal_tax)) / item.quantity)
				: String(parseFloat(item.subtotal) / item.quantity);

			let price = defaultPrice;
			let regular_price = defaultRegularPrice;
			let tax_status = 'taxable';

			try {
				const posData = getMetaDataValueByKey(item.meta_data, '_woocommerce_pos_data');
				if (posData) {
					const parsedData = JSON.parse(posData);
					({
						price = defaultPrice,
						regular_price = defaultRegularPrice,
						tax_status = 'taxable',
					} = parsedData);
				}
			} catch (error) {
				console.error('Error parsing posData:', error);
			}

			return {
				price,
				regular_price,
				tax_status,
			};
		},
		[pricesIncludeTax]
	);

	/**
	 * Generic function to calculate the display price and tax.
	 */
	const calculateDisplayPriceAndTax = React.useCallback(
		(value: string, taxStatus: string, taxClass: string, prices_include_tax: boolean) => {
			const taxes = calculateTaxesFromValue({
				value,
				taxStatus,
				taxClass,
				valueIncludesTax: prices_include_tax,
			});

			const tax = taxes.total;
			const displayPrice = value;

			// mismatched tax settings
			// if (taxDisplayCart === 'excl' && prices_include_tax) {
			// 	displayPrice = String(parseFloat(value) - tax);
			// }

			// // mismatched tax settings
			// if (taxDisplayCart === 'incl' && !prices_include_tax) {
			// 	displayPrice = String(parseFloat(value) + tax);
			// }

			return { displayPrice, tax };
		},
		[calculateTaxesFromValue]
	);

	/**
	 * Calculates the display price and tax for a line item.
	 */
	const getLineItemDisplayPriceAndTax = React.useCallback(
		(item: LineItem) => {
			const prices_include_tax = pricesIncludeTax === 'yes';
			const { price, tax_status } = getLineItemData(item);

			return calculateDisplayPriceAndTax(price, tax_status, item.tax_class, prices_include_tax);
		},
		[calculateDisplayPriceAndTax, getLineItemData, pricesIncludeTax]
	);

	/**
	 * Calculates the display regular price and tax for a line item.
	 */
	const getLineItemDisplayRegularPriceAndTax = React.useCallback(
		(item: LineItem) => {
			const prices_include_tax = pricesIncludeTax === 'yes';
			const { regular_price, tax_status } = getLineItemData(item);

			return calculateDisplayPriceAndTax(
				regular_price,
				tax_status,
				item.tax_class,
				prices_include_tax
			);
		},
		[calculateDisplayPriceAndTax, getLineItemData, pricesIncludeTax]
	);

	return {
		getLineItemData,
		getLineItemDisplayPriceAndTax,
		getLineItemDisplayRegularPriceAndTax,
	};
};
