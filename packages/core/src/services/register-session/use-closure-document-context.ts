import { useDocField } from '@wcpos/query';

import { useT } from '../../contexts/translations';
import { languageForStoreLocale, useLocale } from '../../hooks/use-locale';
import { useStoreDay, useViewedStore } from '../../hooks/use-store-day';
import { useCurrencyFormat } from '../../screens/main/hooks/use-currency-format';
import { labelKeys } from '../../screens/main/reports/closures/document-labels';

import type { ClosureContext } from './closure-document';

export function useClosureDocumentContext(storeId?: number): ClosureContext {
	const store = useViewedStore(storeId);
	const data = useDocField(store, (value) => value);
	const { timezone } = useStoreDay(storeId);
	const { code } = useLocale();
	// A viewed store's own language setting formats its document, as the server copy does.
	const locale = data?.locale ? languageForStoreLocale(data.locale as string).code : code;
	const { format } = useCurrencyFormat({
		currency: data?.currency,
		currencyPosition: data?.currency_pos,
		decimalScale: data?.price_num_decimals,
		decimalSeparator: data?.price_decimal_sep,
		thousandSeparator: data?.price_thousand_sep,
	});
	const t = useT();
	return {
		store: {
			...data,
			name: data?.name ?? '',
			address_lines: [
				data?.store_address,
				data?.store_address_2,
				data?.store_city,
				data?.store_postcode,
			].filter(Boolean),
		},
		currency: data?.currency ?? '',
		timezone,
		locale,
		printedAt: new Date().toISOString(),
		formatMoney: (value) => (value === '' ? '' : format(Number(value))),
		i18n: {
			...Object.fromEntries(Object.entries(labelKeys).map(([key, value]) => [key, t(value)])),
			...data?.receipt_i18n,
		},
	};
}
