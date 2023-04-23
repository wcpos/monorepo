import * as React from 'react';

import { ComboboxWithLabel } from '@wcpos/components/src/combobox';

import useCountries, { CountriesProvider } from '../../../../contexts/countries';

export const StateSelect = ({ label, value, onChange }) => {
	const country = useCountries();
	const options = country.states.map((state) => ({
		label: state.name,
		value: state.code,
	}));

	return <ComboboxWithLabel label={label} options={options} value={value} onChange={onChange} />;
};

const StateSelectWithProvider = (props) => {
	return (
		<CountriesProvider countryCode="AU">
			<StateSelect {...props} />
		</CountriesProvider>
	);
};

export default StateSelectWithProvider;
