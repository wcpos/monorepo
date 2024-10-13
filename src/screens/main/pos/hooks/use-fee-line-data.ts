import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { useObservableEagerState } from 'observable-hooks';

import { parsePosData } from './utils';
import { useAppState } from '../../../../contexts/app-state';

type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];

/**
 * Calculate default fee amount based on tax inclusion.
 */
const calculateDefaultAmount = (item: FeeLine, pricesIncludeTax: boolean) => {
	const total = toNumber(item.total);
	const totalTax = toNumber(item.total_tax);
	return pricesIncludeTax ? total + totalTax : total;
};

/**
 * Custom hook to retrieve and process fee line data.
 */
export const useFeeLineData = () => {
	const { store } = useAppState();
	const pricesIncludeTax = useObservableEagerState(store.prices_include_tax$) === 'yes';

	/**
	 * Retrieves and processes the fee line data.
	 */
	const getFeeLineData = React.useCallback(
		(item: FeeLine) => {
			const defaultAmount = calculateDefaultAmount(item, pricesIncludeTax);
			const defaultPercent = false;

			let amount = defaultAmount;
			let percent = defaultPercent;
			let prices_include_tax = pricesIncludeTax;
			let percent_of_cart_total_with_tax = pricesIncludeTax;

			const posData = parsePosData(item);
			if (posData) {
				amount = posData.amount || defaultAmount;
				percent = posData.percent ?? defaultPercent;
				prices_include_tax = posData.prices_include_tax ?? pricesIncludeTax;
				percent_of_cart_total_with_tax = posData.percent_of_cart_total_with_tax ?? pricesIncludeTax;
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
