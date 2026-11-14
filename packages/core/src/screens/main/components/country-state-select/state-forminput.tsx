import * as React from 'react';

import { OptionsCombobox } from '@wcpos/components/combobox';
import { Input } from '@wcpos/components/input';

import { StatesProvider, useStates } from '../../../../contexts/countries';
import { useT } from '../../../../contexts/translations';

/**
 * Here we follow the API for FormInput: the states as a list (searchable past ten), or an Input
 */
function StateFormInputBase({ value, onChangeText, ...props }: React.ComponentProps<typeof Input>) {
	const t = useT();
	const states = useStates();
	const options = React.useMemo(
		() =>
			(states || []).map((state: { name: string; code: string }) => ({
				label: state.name,
				value: state.code,
			})),
		[states]
	);

	if (options.length > 0) {
		return (
			<OptionsCombobox
				options={options}
				value={value ?? ''}
				onChange={(next) => onChangeText?.(next ?? '')}
				placeholder={t('common.select_state')}
				searchPlaceholder={t('common.search_states')}
				emptyLabel={t('common.no_state_found')}
				triggerTestID="state-select"
				aria-labelledby={props['aria-labelledby']}
			/>
		);
	}

	return <Input value={value} onChangeText={onChangeText} {...props} />;
}
/**
 * We need the provider so we can check how many states are available
 */
export function StateFormInput({
	countryCode,
	...props
}: React.ComponentProps<typeof Input> & { countryCode?: string }) {
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
}
