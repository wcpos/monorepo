import * as React from 'react';

import { decode } from 'html-entities';

import { OptionsCombobox } from '@wcpos/components/combobox';
import type { OptionSelectProps } from '@wcpos/components/select';

import { CountriesProvider, useCountries } from '../../../../contexts/countries';
import { useT } from '../../../../contexts/translations';

type CountryComboboxProps = Omit<OptionSelectProps, 'options' | 'placeholder'>;
function CountryComboboxBase(props: CountryComboboxProps) {
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
	return (
		<OptionsCombobox
			options={options}
			placeholder={t('common.select_country')}
			searchPlaceholder={t('common.search_countries')}
			emptyLabel={t('common.no_country_found')}
			triggerTestID="country-select"
			{...props}
		/>
	);
}
/**
 * We need the provider before the combobox list so that we can display the label
 */
export function CountryCombobox(props: CountryComboboxProps) {
	return (
		<CountriesProvider>
			<CountryComboboxBase {...props} />
		</CountriesProvider>
	);
}
