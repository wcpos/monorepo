import { useObservableEagerState } from 'observable-hooks';

import { useCurrencyFormat } from './use-currency-format';
import { useCurrentOrder } from '../pos/contexts/current-order';

/**
 *
 */
export const useCurrentOrderCurrencyFormat = () => {
	const { currentOrder } = useCurrentOrder();
	const currencySymbol = useObservableEagerState(currentOrder.currency_symbol$);
	const { format } = useCurrencyFormat({ currencySymbol });

	return {
		format,
	};
};
