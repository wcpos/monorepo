import * as React from 'react';

import { decode } from 'html-entities';
import defaults from 'lodash/defaults';
import { useObservableEagerState } from 'observable-hooks';

import { useNumberFormat, NumberFormatOptions } from './use-number-format';
import { useAppState } from '../../../contexts/app-state';
import allCurrencies from '../../../contexts/currencies/currencies.json';

export interface CurrencyFormatOptions extends NumberFormatOptions {
	currency?: string;
	currencySymbol?: string;
	currencyPosition?: string;
}

/**
 * Hook to format numbers based on the selected currency.
 */
export const useCurrencyFormat = (options?: CurrencyFormatOptions) => {
	const { store } = useAppState();
	const currency = useObservableEagerState(store?.currency$);
	const currencyPosition = useObservableEagerState(store?.currency_pos$);

	/**
	 * Get currency symbol
	 *
	 * @TODO - fetch currency from server, wrap the app in a provider
	 * @TODO - have a helper function on the provider to get currency symbol
	 */
	const currencySymbol = React.useMemo(() => {
		if (options?.currencySymbol) {
			return options.currencySymbol;
		}
		if (options?.currency) {
			const currencyData = allCurrencies.find((c) => c.code === options.currency) || {};
			return decode(currencyData.symbol || '');
		}
		const currencyData = allCurrencies.find((c) => c.code === currency) || {};
		return decode(currencyData.symbol || '');
	}, [currency, options]);

	/**
	 * Get prefix and suffix based on currency position
	 */
	const { prefix, suffix } = React.useMemo(() => {
		const positionMap: Record<string, { prefix: string; suffix: string }> = {
			left: { prefix: currencySymbol, suffix: '' },
			left_space: { prefix: `${currencySymbol} `, suffix: '' },
			right: { prefix: '', suffix: currencySymbol },
			right_space: { prefix: '', suffix: ` ${currencySymbol}` },
		};

		return positionMap[currencyPosition] || { prefix: '', suffix: '' };
	}, [currencyPosition, currencySymbol]);

	/**
	 * NOTE: If I memoize the options, the price doesn't update when changing settings.
	 */
	return useNumberFormat(
		defaults(options, {
			fixedDecimalScale: true,
			prefix,
			suffix,
		})
	);
};
