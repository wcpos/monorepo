import { useDocField } from '@wcpos/query';

import { useViewedStore } from '../../../hooks/use-store-day';
import { useCurrencyFormat } from '../hooks/use-currency-format';
import { useNumberFormat } from '../hooks/use-number-format';

export function useReportFormats(storeId?: number) {
	const store = useDocField(useViewedStore(storeId), (value) => value);
	const options = {
		decimalScale: store?.price_num_decimals,
		decimalSeparator: store?.price_decimal_sep,
		thousandSeparator: store?.price_thousand_sep,
		thousandsGroupStyle: store?.thousands_group_style,
	};
	const { format: money } = useCurrencyFormat({
		...options,
		currency: store?.currency,
		currencyPosition: store?.currency_pos,
	});
	const { format: number } = useNumberFormat(options);
	// The percentage carries the store's separators too (+1,3 % where the store writes 1,3).
	const { format: percent } = useNumberFormat({
		...options,
		decimalScale: 1,
		fixedDecimalScale: true,
	});
	return { store, money, number, percent };
}
