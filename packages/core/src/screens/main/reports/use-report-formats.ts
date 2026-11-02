import { useDocField } from '@wcpos/query';

import { useViewedStore } from '../../../hooks/use-store-day';
import { useCurrencyFormat } from '../hooks/use-currency-format';
import { useNumberFormat } from '../hooks/use-number-format';

/**
 * The viewed store's formatters, shared by the hero and every card so they never disagree.
 *
 * Every hook below gets its own object: `useNumberFormat` fills its defaults into the object
 * it is given (lodash `defaults` mutates), so a shared options object would hand the next
 * currency formatter an empty prefix and suffix and its symbol would go missing.
 */
export function useReportFormats(storeId?: number) {
	const store = useDocField(useViewedStore(storeId), (value) => value);
	const separators = {
		decimalSeparator: store?.price_decimal_sep,
		thousandSeparator: store?.price_thousand_sep,
		thousandsGroupStyle: store?.thousands_group_style,
	};
	const currency = { currency: store?.currency, currencyPosition: store?.currency_pos };
	const { format: money } = useCurrencyFormat({
		...separators,
		...currency,
		decimalScale: store?.price_num_decimals,
	});
	// The donut's centre: the total in whole units (the ring's hole is 72 points wide).
	const { format: moneyWhole } = useCurrencyFormat({
		...separators,
		...currency,
		decimalScale: 0,
		fixedDecimalScale: true,
	});
	const { format: number } = useNumberFormat({
		...separators,
		decimalScale: store?.price_num_decimals,
	});
	// Quantities are not money: a zero-decimal currency must not truncate 1.5 items to 1.
	const { format: quantity } = useNumberFormat({ ...separators, decimalScale: 3 });
	// The percentage carries the store's separators too (+1,3 % where the store writes 1,3).
	const { format: percent } = useNumberFormat({
		...separators,
		decimalScale: 1,
		fixedDecimalScale: true,
	});
	return { store, money, moneyWhole, number, quantity, percent };
}
