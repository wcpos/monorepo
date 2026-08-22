import * as React from 'react';

import { OptionSelect } from '@wcpos/components/select';
import type { SelectSingleRootProps } from '@wcpos/components/select';

import { StatesProvider, useStates } from '../../../../contexts/countries';
import { useT } from '../../../../contexts/translations';

/**
 *
 */
export function StateSelectBase({
	value,
	onValueChange,
	...props
}: Omit<SelectSingleRootProps, 'children'>) {
	const t = useT();
	const states = useStates();
	const options: { label: string; value: string }[] = React.useMemo(
		() =>
			(states || []).map((state: { name: string; code: string }) => ({
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

	return (
		<OptionSelect
			options={options}
			value={value?.value}
			onChange={(_nextValue, option) => onValueChange?.(option)}
			placeholder={t('common.select_state')}
			fallbackLabel=""
			{...props}
		/>
	);
}

/**
 * We need the provider before the combobox list so that we can display the label
 */
export function StateSelect({
	countryCode,
	...props
}: Omit<SelectSingleRootProps, 'children'> & { countryCode: string }) {
	return (
		<StatesProvider countryCode={countryCode}>
			<StateSelectBase {...props} />
		</StatesProvider>
	);
}
