import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { getMetaDataValueByKey } from './utils';
import { useAppState } from '../../../../contexts/app-state';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];

/**
 *
 */
export const useLineItemData = () => {
	const { store } = useAppState();
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

	return {
		getLineItemData,
	};
};
