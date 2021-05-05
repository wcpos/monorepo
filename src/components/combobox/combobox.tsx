import * as React from 'react';
import { ScrollView } from 'react-native';
import { useUncontrolledState } from '@wcpos/common/src/hooks/use-uncontrolled-state';
import Popover from '../popover';
import TextInput from '../textinput';

export interface ComboboxChoice {
	/**
	 * Label for the Option.
	 */
	label: string;
	/**
	 * Value for the option.
	 */
	value: string;
	/**
	 * Disable this option.
	 */
	disabled?: boolean;
}

export interface ComboboxProps {
	/**
	 * Choices available in the Select.
	 */
	choices: ComboboxChoice[];
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
	searchValue?: string;
	/**
	 * Text to display as a placeholder.
	 */
	placeholder?: string;
}

/**
 * Let the user search and choose one option from multiple ones.
 */
export const Combobox = ({
	choices,
	selected: selectedRaw = null,
	onChange: onChangeRaw,
	placeholder,
	searchValue,
	onSearch,
}: ComboboxProps) => {
	const [open, setOpen] = React.useState(false);
	const showPopover = React.useCallback(() => setOpen(true), []);
	const [selected, onChange] = useUncontrolledState(
		selectedRaw,
		onChangeRaw as ((value: string | null) => string) | undefined // This will never be called with a null parameter
	);

	const choiceComponents = React.useMemo(
		() =>
			choices.map((choice) => (
				<Popover.Item
					key={choice.value}
					label={choice.label}
					disabled={choice.disabled}
					// eslint-disable-next-line react/jsx-no-bind
					onSelect={() => onChange(choice.value)}
				/>
			)),
		[choices, onChange]
	);

	return (
		<Popover
			open={open}
			activator={
				<TextInput
					onFocus={showPopover}
					placeholder={placeholder}
					onChange={onSearch}
					value={searchValue}
				/>
			}
			onRequestClose={() => {
				setOpen(false);
			}}
			hideBackdrop
			matchWidth
		>
			<ScrollView>{choiceComponents}</ScrollView>
		</Popover>
	);
};
