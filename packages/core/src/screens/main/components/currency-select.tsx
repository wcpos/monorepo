import * as React from 'react';

import { decode } from 'html-entities';

import {
	Combobox,
	ComboboxTrigger,
	ComboboxValue,
	ComboboxContent,
	ComboboxSearch,
	ComboboxEmpty,
	ComboboxList,
	ComboboxInput,
	ComboboxItem,
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
				<ComboboxValue placeholder={t('Select Currency', { _tags: 'core' })} />
			</ComboboxTrigger>
			<ComboboxContent>
				<ComboboxSearch>
					<ComboboxInput placeholder={t('Search Currencies', { _tags: 'core' })} />
					<ComboboxEmpty>{t('No currency found', { _tags: 'core' })}</ComboboxEmpty>
					<ComboboxList>
						{options.map((option) => (
							<ComboboxItem key={option.value} value={option.value} label={option.label} />
						))}
					</ComboboxList>
				</ComboboxSearch>
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
