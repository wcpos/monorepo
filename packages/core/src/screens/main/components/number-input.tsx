import * as React from 'react';
import { Platform } from 'react-native';

import { Input, InputProps } from '@wcpos/components/input';
import { cn } from '@wcpos/components/lib/utils';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';
import { NumberFormatOptions, useNumberFormat } from '../hooks/use-number-format';

export interface NumberInputProps extends Omit<InputProps, 'value' | 'onChangeText' | 'type'> {
	/** The numeric value */
	value?: number | string;

	/** Called on blur with the typed number, only when it differs from `value` */
	onChangeText?: (value: number) => void;

	/** Called on every keystroke with the number typed so far */
	onDraftChange?: (value: number) => void;

	/** Web: how the number reads while the field is not focused (`3.20`); focused, the raw `3.2`. */
	formatOptions?: NumberFormatOptions;

	/** Classes for the displayed number */
	textClassName?: string;
}

/**
 * A numeric input that accepts and emits numbers, on every platform.
 * Uses internal string state to allow typing decimals freely.
 * Emits number on blur, and only a changed one: focusing and leaving writes nothing.
 */
export function NumberInput({
	value,
	onChangeText,
	onDraftChange,
	formatOptions,
	onBlur,
	onFocus,
	inputClassName,
	textClassName,
	...props
}: NumberInputProps) {
	const { store } = useAppState();
	const decimalSeparator = useDocField(store, (state) => state.price_decimal_sep) || '.';
	const { format } = useNumberFormat(formatOptions);

	/**
	 * Convert number to display string using the store's decimal separator
	 */
	const numberToString = React.useCallback(
		(num: number | string | null | undefined): string => {
			if (num == null || num === '') return '';
			const str = String(num);
			// Replace dot with the store's decimal separator for display
			return decimalSeparator === ',' ? str.replace('.', ',') : str;
		},
		[decimalSeparator]
	);

	/**
	 * Parse display string to number, handling the store's decimal separator
	 */
	const stringToNumber = React.useCallback((text: string): number => {
		if (text === '' || text === '-') return 0;
		// Normalize to dot for parseFloat (handles both comma and dot input)
		const normalized = text.replace(',', '.');
		const num = parseFloat(normalized);
		return Number.isNaN(num) ? 0 : num;
	}, []);

	// Internal string state for free-form typing
	const [internalValue, setInternalValue] = React.useState(() => numberToString(value));
	const [isFocused, setIsFocused] = React.useState(false);
	const [syncKey, setSyncKey] = React.useState(0);

	// Sync from parent when the value changes externally (and not focused).
	// Implemented as the React "adjust state during render" pattern (tracking the
	// previous display value) rather than an effect, so it never sets state inside
	// useEffect. While focused we skip syncing so typing isn't interrupted.
	const displayValue = numberToString(value);
	const [prevDisplayValue, setPrevDisplayValue] = React.useState(displayValue);
	const [prevIsFocused, setPrevIsFocused] = React.useState(isFocused);
	if (displayValue !== prevDisplayValue || isFocused !== prevIsFocused) {
		setPrevDisplayValue(displayValue);
		setPrevIsFocused(isFocused);
		if (!isFocused) {
			setInternalValue(displayValue);
			if (displayValue !== prevDisplayValue) {
				// #1957: RN Fabric iOS drops controlled-text updates when event counts disagree
				// in RCTTextInputComponentView updateState and setTextAndSelection. Remounting
				// while unfocused gives the native view the current value. Never remount while
				// focused, so typing is never cut off.
				setSyncKey((k) => k + 1);
			}
		}
	}

	// Web only: at rest the field reads formatted, and focus swaps in the raw string that is
	// edited and parsed, so the formatted one (grouping, a fixed scale) never reaches
	// `stringToNumber`. Native keeps the raw string always: the swap is a controlled-text update
	// while focused, which Fabric iOS can drop (#1957), and keystrokes would then edit the
	// formatted string ("1,234.505" parses as 1.234).
	const shown =
		Platform.OS === 'web' && !isFocused && internalValue !== ''
			? format(stringToNumber(internalValue))
			: internalValue;

	// Emit the number on blur, only when it differs from the incoming value: a focus and leave
	// must not write the record (a blank regular price would become "0").
	const handleBlur = React.useCallback(
		(e: any) => {
			setIsFocused(false);
			const typed = stringToNumber(internalValue);
			if (onChangeText && typed !== stringToNumber(numberToString(value))) {
				onChangeText(typed);
			}
			onBlur?.(e);
		},
		[internalValue, value, onChangeText, onBlur, stringToNumber, numberToString]
	);

	const handleFocus = React.useCallback(
		(e: any) => {
			setIsFocused(true);
			onFocus?.(e);
		},
		[onFocus]
	);

	const handleChangeText = React.useCallback(
		(text: string) => {
			setInternalValue(text);
			onDraftChange?.(stringToNumber(text));
		},
		[onDraftChange, stringToNumber]
	);

	return (
		<Input
			key={syncKey}
			{...props}
			inputClassName={cn(inputClassName, textClassName)}
			value={shown}
			onChangeText={handleChangeText}
			onFocus={handleFocus}
			onBlur={handleBlur}
			type="decimal"
		/>
	);
}
