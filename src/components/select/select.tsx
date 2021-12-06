import * as React from 'react';
import { ScrollView } from 'react-native';
import { useUncontrolledState } from '@wcpos/common/src/hooks/use-uncontrolled-state';
import Dropdown, { useDropdown } from '../dropdown';
import Arrow from '../arrow';
import BaseInput, { BaseInputContainer } from '../base-input';

export interface SelectChoice {
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

export interface SelectProps {
	/**
	 * Label for the Select.
	 */
	label: string;
	/**
	 * Choices available in the Select.
	 */
	choices: SelectChoice[] | string[];
	/**
	 * Currently selected value. If null, no value is selected.
	 */
	selected?: string | null;
	/**
	 * Callback called when selection is changed.
	 */
	onChange?: (selected: string) => void;
	/**
	 * Text to display as a placeholder.
	 */
	placeholder?: string;
	/**
	 * Additional text to help the user.
	 */
	helpText?: React.ReactNode;
	/**
	 * Display an error state.
	 */
	error?: boolean | string;
	/**
	 * Disable the input and choice selection.
	 */
	disabled?: boolean;
}

const maxHeight = 300;

/**
 * Let the user choose one option from multiple ones.
 */
export const Select = ({
	label,
	choices: choicesRaw,
	selected: selectedRaw = null,
	onChange: onChangeRaw,
	placeholder,
	helpText,
	error = false,
	disabled = false,
}: SelectProps) => {
	const { ref, open, close } = useDropdown();
	const [selected, onChange] = useUncontrolledState(
		selectedRaw,
		onChangeRaw as ((value: string | null) => string) | undefined // This will never be called with a null parameter
	);

	const choices = React.useMemo(
		() =>
			choicesRaw.map((choice) =>
				typeof choice === 'string' ? { label: choice, value: choice } : choice
			),
		[choicesRaw]
	);

	const selectedChoice = React.useMemo(
		() => choices.find((x) => x.value === selected),
		[choices, selected]
	);

	const handleSelect = (value: string) => {
		onChange(value);
		close();
	};

	// const choiceComponents = React.useMemo(
	// 	() =>
	// 		choices.map((choice) => (
	// 			<Popover.Item
	// 				key={choice.value}
	// 				label={choice.label}
	// 				disabled={choice.disabled}
	// 				// eslint-disable-next-line react/jsx-no-bind
	// 				onSelect={() => handleSelect(choice.value)}
	// 			/>
	// 		)),
	// 	[choices, onChange]
	// );

	return (
		<BaseInputContainer
			label={label}
			disabled={disabled}
			helpText={helpText}
			error={error}
			onLabelClick={open}
		>
			<Dropdown
				ref={ref}
				items={choices}
				// popoverStyle={{ maxHeight }}
				// placement="bottom"
				matchWidth
				withArrow={false}
			>
				<BaseInput
					value={selectedChoice?.label ?? ''}
					placeholder={placeholder}
					disabled={disabled}
					// focused={open}
					onPress={open}
					// rightAccessory={<Arrow direction={open ? 'up' : 'down'} />}
					style={{ minWidth: '100px' }}
				/>
			</Dropdown>
		</BaseInputContainer>
	);
};
