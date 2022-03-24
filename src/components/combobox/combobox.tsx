import * as React from 'react';
import { ScrollView } from 'react-native';
import { useUncontrolledState } from '@wcpos/common/src/hooks/use-uncontrolled-state';
import Dropdown from '../dropdown';
import TextInput from '../textinput';
// import Search from '../search';

export interface ComboboxOptions {
	/**
	 * Label for the Option.
	 */
	key: string;
	/**
	 * Label for the Option.
	 */
	label: string;
	/**
	 * Value for the option.
	 */
	value: any;
	/**
	 * Disable this option.
	 */
	disabled?: boolean;
}

export interface ComboboxProps {
	/**
	 * Label to display above the input.
	 */
	label: string;
	/**
	 * Options available in the Select.
	 */
	options: ComboboxOptions[];
	/**
	 * Currently selected value. If null, no value is selected.
	 */
	selected?: string | null;
	/**
	 * Callback called when selection is changed.
	 */
	onChange?: (selected: any) => void;
	/**
	 * Callback called when selection is changed.
	 */
	onSearch?: (value: string) => void;
	/**
	 * Search term
	 */
	searchValue?: string | null;
	/**
	 * Text to display as a placeholder.
	 */
	placeholder?: string;
	/**
	 * Set this to `true` to hide the label on top of the input. `label` property is still mandatory for accessibility purposes, even if not shown.
	 */
	hideLabel?: boolean;
}

/**
 * Let the user search and choose one option from multiple ones.
 */
export const Combobox = ({
	label,
	options,
	selected: selectedRaw = null,
	onChange: onChangeRaw,
	placeholder,
	searchValue,
	onSearch,
	hideLabel,
}: ComboboxProps) => {
	const [selected, onChange] = useUncontrolledState(
		selectedRaw,
		onChangeRaw as ((value: string | null) => string) | undefined // This will never be called with a null parameter
	);

	// const choiceComponents = React.useMemo(
	// 	() =>
	// 		choices.map((choice) => (
	// 			<Popover.Item
	// 				key={choice.key}
	// 				label={choice.label}
	// 				disabled={choice.disabled}
	// 				// eslint-disable-next-line react/jsx-no-bind
	// 				onSelect={() => onChange(choice.value)}
	// 			/>
	// 		)),
	// 	[choices, onChange]
	// );

	return (
		<Dropdown withArrow={false} matchWidth items={options}>
			<TextInput
				label={label}
				hideLabel={hideLabel}
				// onFocus={showPopover}
				placeholder={placeholder}
				onChange={onSearch}
				value={searchValue || selected}
				clearable
				onClear={() => onChange(null)}
			/>
		</Dropdown>
	);
};
