import * as React from 'react';

import { decode } from 'html-entities';

import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
	ComboboxSearch,
	ComboboxTrigger,
	ComboboxValue,
} from '@wcpos/components/src/combobox';

import { CountriesProvider, useCountries } from '../../../../contexts/countries';
import { useT } from '../../../../contexts/translations';

/**
 *
 */
const _CountryCombobox = React.forwardRef<React.ElementRef<typeof Combobox>, any>(
	({ value, onValueChange, disabled, ...props }, ref) => {
		const allCountries = useCountries();
		const t = useT();

		/**
		 *
		 */
		const options = React.useMemo(
			() =>
				allCountries.map((country) => ({
					label: decode(country.name),
					value: country.code,
				})),
			[allCountries]
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
			<Combobox ref={ref} value={{ ...value, label }} onValueChange={onValueChange} {...props}>
				<ComboboxTrigger disabled={disabled}>
					<ComboboxValue placeholder={t('Select Country', { _tags: 'core' })} />
				</ComboboxTrigger>
				<ComboboxContent>
					<ComboboxSearch>
						<ComboboxInput placeholder={t('Search Countries', { _tags: 'core' })} />
						<ComboboxEmpty>{t('No country found', { _tags: 'core' })}</ComboboxEmpty>
						<ComboboxList>
							{options.map((option) => (
								<ComboboxItem key={option.value} value={option.value} label={option.label} />
							))}
						</ComboboxList>
					</ComboboxSearch>
				</ComboboxContent>
			</Combobox>
		);
	}
);

/**
 * We need the provider before the combobox list so that we can display the label
 */
export const CountryCombobox = React.forwardRef<React.ElementRef<typeof _CountryCombobox>, any>(
	(props, ref) => {
		return (
			<CountriesProvider>
				<_CountryCombobox ref={ref} {...props} />
			</CountriesProvider>
		);
	}
);
