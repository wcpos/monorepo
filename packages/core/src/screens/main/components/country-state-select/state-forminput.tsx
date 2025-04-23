import * as React from 'react';

import { Input } from '@wcpos/components/input';

import { StateCombobox } from './state-combobox';
import { StateSelect } from './state-select';
import { StatesProvider, useStates } from '../../../../contexts/countries';

/**
 * Here we follow the API for FormInput, but we switch between Input, Combobox and a Select
 */
const StateFormInputBase = ({
	value,
	onChangeText,
	...props
}: React.ComponentProps<typeof Input>) => {
	const states = useStates();
	const hasStates = states && states.length > 0;
	const hasManyStates = states && states.length > 10;

	/**
	 * Handle select
	 */
	const handleSelect = React.useCallback(
		({ value }) => {
			onChangeText(value);
		},
		[onChangeText]
	);

	if (hasStates) {
		if (hasManyStates) {
			return <StateCombobox value={{ value }} onValueChange={handleSelect} />;
		}
		return <StateSelect value={{ value }} onValueChange={handleSelect} />;
	}

	return <Input value={value} onChangeText={onChangeText} {...props} />;
};
/**
 * We need the provider so we can check how many states are available
 */
export const StateFormInput = ({
	countryCode,
	...props
}: React.ComponentProps<typeof Input> & { countryCode?: string }) => {
	/**
	 * If no country code is provided, we just render an input
	 */
	if (!countryCode) {
		return <Input {...props} />;
	}

	return (
		<StatesProvider countryCode={countryCode}>
			<StateFormInputBase {...props} />
		</StatesProvider>
	);
};
