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

import { CountriesProvider, useCountries } from '../../../../contexts/countries';
import { useT } from '../../../../contexts/translations';

/**
 *
 */
const CountryComboboxBase = ({
	value,
	disabled,
	...props
}: React.ComponentProps<typeof Combobox>) => {
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
		<Combobox value={{ ...value, label }} {...props}>
			<ComboboxTrigger disabled={disabled}>
				<ComboboxValue placeholder={t('Select Country')} />
			</ComboboxTrigger>
			<ComboboxContent>
				<ComboboxInput placeholder={t('Search Countries')} />
				<ComboboxList
					data={options}
					renderItem={({ item }) => (
						<ComboboxItem value={item.value} label={item.label}>
							<ComboboxItemText>{item.label}</ComboboxItemText>
						</ComboboxItem>
					)}
					estimatedItemSize={44}
					ListEmptyComponent={<ComboboxEmpty>{t('No country found')}</ComboboxEmpty>}
				/>
			</ComboboxContent>
		</Combobox>
	);
};
/**
 * We need the provider before the combobox list so that we can display the label
 */
export const CountryCombobox = (props: React.ComponentProps<typeof Combobox>) => {
	return (
		<CountriesProvider>
			<CountryComboboxBase {...props} />
		</CountriesProvider>
	);
};
