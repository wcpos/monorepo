import { useRecordField } from '@wcpos/query';

import { CurrencyFormatOptions, useCurrencyFormat } from './use-currency-format';
import { useCurrentOrder } from '../pos/contexts/current-order';

/**
 *
 */
export const useCurrentOrderCurrencyFormat = (options?: CurrencyFormatOptions) => {
	const { currentOrderRecord } = useCurrentOrder();
	const currencySymbol = useRecordField(
		currentOrderRecord,
		(order) => order.payload.currency_symbol
	);
	const { format } = useCurrencyFormat({ currencySymbol, ...options });

	return {
		format,
	};
};
