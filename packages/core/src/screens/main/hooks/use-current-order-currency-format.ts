import { useObservableEagerState } from 'observable-hooks';

import { CurrencyFormatOptions, useCurrencyFormat } from './use-currency-format';
import { useCurrentOrder } from '../pos/contexts/current-order';

/**
 *
 */
export const useCurrentOrderCurrencyFormat = (options?: CurrencyFormatOptions) => {
	const { currentOrder } = useCurrentOrder();
	const currencySymbol = useObservableEagerState(currentOrder.currency_symbol$!) as
		| string
		| undefined;
	const { format } = useCurrencyFormat({ currencySymbol, ...options });

	return {
		format,
	};
};
