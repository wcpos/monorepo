import * as React from 'react';

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

import { StatesProvider, useStates } from '../../../../contexts/countries';
import { useT } from '../../../../contexts/translations';

/**
 *
 */
const _StateCombobox = React.forwardRef<React.ElementRef<typeof Combobox>, any>(
	({ value, onValueChange, disabled, ...props }, ref) => {
		const t = useT();
		const states = useStates();
		const options = React.useMemo(
			() =>
				(states || []).map((state) => ({
					label: state.name,
					value: state.code,
				})),
			[states]
		);

		// /**
		//  * HACK: if old state value is set and country changes
		//  */
		// React.useEffect(() => {
		// 	const selected = options.find((option) => option.value === value);
		// 	if (!isEmpty(value) && !selected) {
		// 		onChange('');
		// 	}
		// }, [onChange, options, value]);

		/**
		 *
		 */
		return (
			<Combobox
				ref={ref}
				value={{ ...value, label: options.find((option) => option.value === value?.value)?.label }}
				onValueChange={onValueChange}
				{...props}
			>
				<ComboboxTrigger disabled={disabled}>
					<ComboboxValue placeholder={t('Select State', { _tags: 'core' })} />
				</ComboboxTrigger>
				<ComboboxContent>
					<ComboboxSearch>
						<ComboboxInput placeholder={t('Search States', { _tags: 'core' })} />
						<ComboboxEmpty>{t('No state found', { _tags: 'core' })}</ComboboxEmpty>
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
export const StateCombobox = React.forwardRef<React.ElementRef<typeof _StateCombobox>, any>(
	({ countryCode, ...props }, ref) => {
		return (
			<StatesProvider countryCode={countryCode}>
				<_StateCombobox ref={ref} {...props} />
			</StatesProvider>
		);
	}
);
