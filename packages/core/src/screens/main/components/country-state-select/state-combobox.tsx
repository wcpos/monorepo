import * as React from 'react';

import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxItemText,
	ComboboxList,
	type ComboboxSingleRootProps,
	ComboboxTrigger,
	ComboboxValue,
} from '@wcpos/components/combobox';

import { StatesProvider, useStates } from '../../../../contexts/countries';
import { useT } from '../../../../contexts/translations';

/**
 *
 */
/** The root takes no aria props, so the field's label reference goes to the trigger. */
type StateComboboxProps = ComboboxSingleRootProps & { 'aria-labelledby'?: string };
function StateComboboxBase({ value, disabled, ...props }: StateComboboxProps) {
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

	/**
	 *
	 */
	return (
		<Combobox
			value={{
				value: value?.value ?? '',
				label:
					options.find((option: { value: string; label: string }) => option.value === value?.value)
						?.label ?? '',
			}}
			{...props}
		>
			<ComboboxTrigger
				testID="state-select-trigger"
				disabled={disabled}
				aria-labelledby={props['aria-labelledby']}
			>
				<ComboboxValue placeholder={t('common.select_state')} />
			</ComboboxTrigger>
			<ComboboxContent>
				<ComboboxInput placeholder={t('common.search_states')} />
				<ComboboxList
					data={options}
					renderItem={({ item }) => (
						<ComboboxItem value={String(item.value)} label={item.label} item={item}>
							<ComboboxItemText />
						</ComboboxItem>
					)}
					estimatedItemSize={44}
					ListEmptyComponent={<ComboboxEmpty>{t('common.no_state_found')}</ComboboxEmpty>}
				/>
			</ComboboxContent>
		</Combobox>
	);
}
/**
 * We need the provider before the combobox list so that we can display the label
 */
export function StateCombobox({
	countryCode,
	...props
}: StateComboboxProps & { countryCode?: string }) {
	return (
		<StatesProvider countryCode={countryCode ?? ''}>
			<StateComboboxBase {...props} />
		</StatesProvider>
	);
}
