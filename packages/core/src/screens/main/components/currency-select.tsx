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

import useCurrencies, { CurrenciesProvider } from '../../../contexts/currencies';
import { useT } from '../../../contexts/translations';

/**
 *
 */
const CurrencySelectBase = ({ value, ...props }: React.ComponentProps<typeof Combobox>) => {
	const t = useT();
	const allCurrencies = useCurrencies();

	/**
	 *
	 */
	const options = React.useMemo(
		() =>
			allCurrencies.map((currency) => ({
				label: `${decode(currency.name)} (${decode(currency.symbol)})`,
				value: currency.code,
			})),
		[allCurrencies]
	);

	/**
	 *
	 */
	const label = React.useMemo(() => {
		const selected = options.find((option) => option.value === value.value);
		return selected?.label;
	}, [options, value]);

	/**
	 *
	 */
	return (
		<Combobox value={{ ...value, label }} {...props}>
			<ComboboxTrigger>
				<ComboboxValue placeholder={t('Select Currency')} />
			</ComboboxTrigger>
			<ComboboxContent>
				<ComboboxInput placeholder={t('Search Currencies')} />
				<ComboboxList
					data={options}
					renderItem={({ item }) => (
						<ComboboxItem value={item.value} label={item.label}>
							<ComboboxItemText>{item.label}</ComboboxItemText>
						</ComboboxItem>
					)}
					estimatedItemSize={44}
					ListEmptyComponent={<ComboboxEmpty>{t('No currency found')}</ComboboxEmpty>}
				/>
			</ComboboxContent>
		</Combobox>
	);
};

/**
 * We need the provider before the combobox list so that we can display the label
 */
export const CurrencySelect = (props) => {
	return (
		<CurrenciesProvider>
			<CurrencySelectBase {...props} />
		</CurrenciesProvider>
	);
};
