import * as React from 'react';

import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxItemText,
	ComboboxList,
	ComboboxTrigger,
	ComboboxValue,
} from '@wcpos/components/combobox';

import { StatesProvider, useStates } from '../../../../contexts/countries';
import { useT } from '../../../../contexts/translations';

/**
 *
 */
const StateComboboxBase = ({
	value,
	disabled,
	...props
}: React.ComponentProps<typeof Combobox>) => {
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
			value={{
				value: value?.value ?? '',
				label:
					options.find((option: { value: string; label: string }) => option.value === value?.value)
						?.label ?? '',
			}}
			{...props}
		>
			<ComboboxTrigger disabled={disabled}>
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
};
/**
 * We need the provider before the combobox list so that we can display the label
 */
export const StateCombobox = ({
	countryCode,
	...props
}: React.ComponentProps<typeof Combobox> & { countryCode?: string }) => {
	return (
		<StatesProvider countryCode={countryCode ?? ''}>
			<StateComboboxBase {...props} />
		</StatesProvider>
	);
};
