import * as React from 'react';

import { Input } from '@wcpos/components/src/input';

import { StateCombobox } from './state-combobox';
import { StateSelect } from './state-select';
import { StatesProvider, useStates } from '../../../../contexts/countries';

type CompType = React.ElementRef<typeof Input | typeof StateSelect | typeof StateCombobox>;

/**
 * Here we follow the API for FormInput, but we switch between Input, Combobox and a Select
 */
const _StateFormInput = React.forwardRef<CompType, any>(
	({ value, onChangeText, ...props }, ref) => {
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
				return (
					<StateCombobox ref={ref} value={{ value }} onValueChange={handleSelect} {...props} />
				);
			}
			return <StateSelect ref={ref} value={{ value }} onValueChange={handleSelect} {...props} />;
		}

		return <Input ref={ref} value={value} onChangeText={onChangeText} {...props} />;
	}
);

/**
 * We need the provider so we can check how many states are available
 */
export const StateFormInput = React.forwardRef<React.ElementRef<typeof _StateFormInput>, any>(
	(props, ref) => {
		/**
		 * If no country code is provided, we just render an input
		 */
		if (!props.countryCode) {
			return <Input ref={ref} {...props} />;
		}

		return (
			<StatesProvider countryCode={props.countryCode}>
				<_StateFormInput ref={ref} {...props} />
			</StatesProvider>
		);
	}
);
