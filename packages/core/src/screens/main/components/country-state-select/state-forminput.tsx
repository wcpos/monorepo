import * as React from 'react';

import type { Option } from '@wcpos/components/combobox';
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
	countryCode,
	...props
}: React.ComponentProps<typeof Input> & { countryCode?: string }) => {
	const states = useStates();
	const hasStates = states && states.length > 0;
	const hasManyStates = states && states.length > 10;

	/**
	 * Handle select
	 */
	const handleSelect = React.useCallback(
		(option: Option<any> | undefined) => {
			onChangeText?.(String(option?.value ?? ''));
		},
		[onChangeText]
	);

	if (hasStates) {
		if (hasManyStates) {
			return (
				// @ts-expect-error: StateCombobox provides its own children but ComponentProps<typeof Combobox> requires them
				<StateCombobox
					value={{ value: value ?? '', label: '' }}
					onValueChange={handleSelect}
					countryCode={countryCode}
				/>
			);
		}
		return (
			<StateSelect
				value={{ value: value ?? '', label: '' }}
				onValueChange={handleSelect}
				countryCode={countryCode ?? ''}
			/>
		);
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
			<StateFormInputBase {...props} countryCode={countryCode} />
		</StatesProvider>
	);
};
