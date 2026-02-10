import * as React from 'react';

import { decode } from 'html-entities';

import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxItemText,
	ComboboxList,
	ComboboxTrigger,
	ComboboxValue,
} from '@wcpos/components/combobox';

import { CurrenciesProvider, useCurrencies } from '../../../contexts/currencies';
import { useT } from '../../../contexts/translations';

/**
 *
 */
function CurrencySelectBase({ value, ...props }: React.ComponentProps<typeof Combobox>) {
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

	/**
	 *
	 */
	const label = React.useMemo(() => {
		const selected = options.find((option) => option.value === value?.value);
		return selected?.label;
	}, [options, value]);

	/**
	 *
	 */
	return (
		<Combobox value={{ value: value?.value ?? '', label: label ?? '' }} {...props}>
			<ComboboxTrigger>
				<ComboboxValue placeholder={t('common.select_currency')} />
			</ComboboxTrigger>
			<ComboboxContent>
				<ComboboxInput placeholder={t('common.search_currencies')} />
				<ComboboxList
					data={options}
					renderItem={({ item }) => (
						<ComboboxItem value={String(item.value)} label={item.label} item={item}>
							<ComboboxItemText />
						</ComboboxItem>
					)}
					estimatedItemSize={44}
					ListEmptyComponent={<ComboboxEmpty>{t('common.no_currency_found')}</ComboboxEmpty>}
				/>
			</ComboboxContent>
		</Combobox>
	);
}

/**
 * We need the provider before the combobox list so that we can display the label
 */
export function CurrencySelect(props: React.ComponentProps<typeof Combobox>) {
	return (
		<CurrenciesProvider>
			<CurrencySelectBase {...props} />
		</CurrenciesProvider>
	);
}
