import * as React from 'react';

import { decode } from 'html-entities';

import { OptionsCombobox } from '@wcpos/components/combobox';
import type { OptionSelectProps } from '@wcpos/components/select';

import { CurrenciesProvider, useCurrencies } from '../../../contexts/currencies';
import { useT } from '../../../contexts/translations';

/**
 *
 */
function CurrencySelectBase(props: Omit<OptionSelectProps, 'options' | 'placeholder'>) {
	const t = useT();
	const allCurrencies = useCurrencies();

	/**
	 *
	 */
	const options: { label: string; value: string }[] = React.useMemo(
		() =>
			allCurrencies.map((currency: { name: string; symbol: string; code: string }) => ({
				label: `${decode(currency.name)} (${decode(currency.symbol)})`,
				value: currency.code,
			})),
		[allCurrencies]
	);

	return (
		<OptionsCombobox
			options={options}
			placeholder={t('common.select_currency')}
			searchPlaceholder={t('common.search_currencies')}
			emptyLabel={t('common.no_currency_found')}
			triggerTestID="currency-select"
			{...props}
		/>
	);
}

/**
 * We need the provider before the combobox list so that we can display the label
 */
export function CurrencySelect(props: Omit<OptionSelectProps, 'options' | 'placeholder'>) {
	return (
		<CurrenciesProvider>
			<CurrencySelectBase {...props} />
		</CurrenciesProvider>
	);
}
