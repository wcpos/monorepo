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
} from '@wcpos/components/src/combobox';

import useCurrencies, { CurrenciesProvider } from '../../../contexts/currencies';
import { useT } from '../../../contexts/translations';

/**
 *
 */
const _CurrencySelect = React.forwardRef<
	React.ElementRef<typeof Combobox>,
	React.ComponentPropsWithoutRef<typeof Combobox>
>(({ value, onValueChange, ...props }, ref) => {
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
		<Combobox ref={ref} value={{ ...value, label }} onValueChange={onValueChange}>
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
});

/**
 * We need the provider before the combobox list so that we can display the label
 */
export const CurrencySelect = React.forwardRef<React.ElementRef<typeof _CurrencySelect>, any>(
	(props, ref) => {
		return (
			<CurrenciesProvider>
				<_CurrencySelect ref={ref} {...props} />
			</CurrenciesProvider>
		);
	}
);
