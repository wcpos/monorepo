import * as React from 'react';

import isEmpty from 'lodash/isEmpty';

import { ComboboxWithLabel } from '@wcpos/components/src/combobox';
import { TextInputWithLabel } from '@wcpos/components/src/textinput';

import useCountries, { CountriesProvider } from '../../../../contexts/countries';

/**
 *
 * @param param0
 * @returns
 */
const _StateSelect = ({ label, value, onChange }) => {
	const country = useCountries();
	const options = React.useMemo(
		() =>
			country.states
				? country.states.map((state) => ({
						label: state.name,
						value: state.code,
					}))
				: [],
		[country.states]
	);

	/**
	 * HACK: if old state value is set and country changes
	 */
	React.useEffect(() => {
		const selected = options.find((option) => option.value === value);
		if (!isEmpty(value) && !selected) {
			onChange('');
		}
	}, [onChange, options, value]);

	/**
	 * If no state options, let them type
	 */
	if (isEmpty(options)) {
		return <TextInputWithLabel label={label} value={value} onChangeText={onChange} />;
	}

	return <ComboboxWithLabel label={label} options={options} value={value} onChange={onChange} />;
};

/**
 *
 */
export const StateSelect = ({ country, ...props }) => {
	return (
		<CountriesProvider countryCode={country}>
			<_StateSelect {...props} />
		</CountriesProvider>
	);
};
