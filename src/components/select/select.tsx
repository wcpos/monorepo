import * as React from 'react';
import { ScrollView } from 'react-native';
import get from 'lodash/get';
import isPlainObject from 'lodash/isPlainObject';
import { useUncontrolledState } from '@wcpos/common/src/hooks/use-uncontrolled-state';
import Dropdown, { useDropdown } from '../dropdown';
import Arrow from '../arrow';
import BaseInput, { BaseInputContainer } from '../base-input';

export interface SelectOption {
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
	 * Options available in the Select.
	 */
	options: SelectOption[] | string[];
	/**
	 * Currently selected value. If null, no value is selected.
	 */
	value?: SelectOption | string | null;
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
	options: optionsRaw,
	value: selectedRaw = null,
	onChange: onChangeRaw,
	placeholder = 'Select',
	helpText,
	error = false,
	disabled = false,
}: SelectProps) => {
	const { ref, open, close } = useDropdown();
	const [selected, onChange] = useUncontrolledState(
		selectedRaw,
		onChangeRaw as ((value: string | null) => string) | undefined // This will never be called with a null parameter
	);

	const options = React.useMemo(() => {
		let _options = optionsRaw;

		// special case for { 0: '', 1: '', ... } or { '0': { label: '', value: ''}, ... }
		if (isPlainObject(optionsRaw)) {
			_options = Object.values(optionsRaw);
		}

		// turn strings into [{ label: '', value: '' }, ...]
		if (Array.isArray(_options)) {
			return _options.map((choice) =>
				typeof choice === 'string' ? { label: choice, value: choice } : choice
			);
		}

		return _options;
	}, [optionsRaw]);

	const selectedChoice = React.useMemo(() => {
		return options.find((x) => x.value === selected);
	}, [options, selected]);

	const handleSelect = (selected: any) => {
		onChange(selected);
		close();
	};

	return (
		<BaseInputContainer
			label={label}
			disabled={disabled}
			helpText={helpText}
			error={error}
			onLabelClick={open}
		>
			<Dropdown ref={ref} items={options} onSelect={handleSelect} matchWidth withArrow={false}>
				<BaseInput
					value={selected?.label ?? ''}
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
