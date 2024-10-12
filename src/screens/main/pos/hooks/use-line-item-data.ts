import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { useObservableEagerState } from 'observable-hooks';

import { parsePosData } from './utils';
import { useAppState } from '../../../../contexts/app-state';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type TaxStatus = 'taxable' | 'none';

/**
 * Calculate the price and regular price based on tax inclusion and quantity.
 */
const calculatePrices = (item: LineItem, pricesIncludeTax: boolean) => {
	const quantity = item.quantity ?? 0;
	const total = toNumber(item.total ?? 0);
	const subtotal = toNumber(item.subtotal ?? 0);
	const totalTax = toNumber(item.total_tax ?? 0);
	const subtotalTax = toNumber(item.subtotal_tax ?? 0);

	const price = pricesIncludeTax ? (total + totalTax) / quantity : total / quantity;

	const regularPrice = pricesIncludeTax ? (subtotal + subtotalTax) / quantity : subtotal / quantity;

	return { price, regularPrice };
};

/**
 * Custom hook to handle LineItem data.
 */
export const useLineItemData = () => {
	const { store } = useAppState();
	const pricesIncludeTax = useObservableEagerState(store.prices_include_tax$!) === 'yes';

	/**
	 * Retrieves and processes the line item data.
	 */
	const getLineItemData = React.useCallback(
		(item: LineItem) => {
			const { price: defaultPrice, regularPrice: defaultRegularPrice } = calculatePrices(
				item,
				pricesIncludeTax
			);

			let price = defaultPrice;
			let regular_price = defaultRegularPrice;
			let tax_status: TaxStatus = 'taxable';

			const posData = parsePosData(item);
			if (posData) {
				price = posData.price || defaultPrice;
				regular_price = posData.regular_price || defaultRegularPrice;
				tax_status = posData.tax_status || tax_status;
			}

			return { price, regular_price, tax_status };
		},
		[pricesIncludeTax]
	);

	return { getLineItemData };
};
