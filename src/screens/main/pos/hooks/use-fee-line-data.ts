import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { getMetaDataValueByKey } from './utils';
import { useAppState } from '../../../../contexts/app-state';

type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];

/**
 *
 */
export const useFeeLineData = () => {
	const { store } = useAppState();
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
			let percent_of_cart_total_with_tax = defaultPricesIncludeTax;

			try {
				const posData = getMetaDataValueByKey(item.meta_data, '_woocommerce_pos_data');
				if (posData) {
					const parsedData = JSON.parse(posData);
					({
						amount = defaultAmount,
						percent = defaultPercent,
						prices_include_tax = defaultPricesIncludeTax,
						percent_of_cart_total_with_tax = defaultPricesIncludeTax,
					} = parsedData);
				}
			} catch (error) {
				console.error('Error parsing posData:', error);
			}

			return {
				amount,
				percent,
				prices_include_tax,
				percent_of_cart_total_with_tax,
			};
		},
		[pricesIncludeTax]
	);

	return {
		getFeeLineData,
	};
};
