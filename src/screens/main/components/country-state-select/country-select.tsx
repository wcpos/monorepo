import * as React from 'react';

import { ComboboxWithLabel } from '@wcpos/components/src/combobox';

import useCountries, { CountriesProvider } from '../../../../contexts/countries';

const CountrySelect = ({ label, value = 'AU', onChange }) => {
	const allCountries = useCountries();
	const options = allCountries.map((country) => ({
		label: country.name,
		value: country.code,
	}));

	return <ComboboxWithLabel label={label} options={options} value={value} onChange={onChange} />;
};

const CountrySelectWithProvider = (props) => {
	return (
		<CountriesProvider>
			<CountrySelect {...props} />
		</CountriesProvider>
	);
};

export default CountrySelectWithProvider;
