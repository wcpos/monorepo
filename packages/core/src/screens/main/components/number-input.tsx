import * as React from 'react';
import { Platform, type TextInputInstance } from 'react-native';

import { Input, InputProps } from '@wcpos/components/input';
import { cn } from '@wcpos/components/lib/utils';
import { useMergedRef } from '@wcpos/hooks/use-merged-ref';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';
import { NumberFormatOptions, useNumberFormat } from '../hooks/use-number-format';

export interface NumberInputProps extends Omit<InputProps, 'value' | 'onChangeText' | 'type'> {
	/** The numeric value */
	value?: number | string;

	/** Called when the value changes */
	onChangeText?: (value: number) => void;

	/** How the number reads while the field is not focused (`3.20`); focused, it is the raw `3.2`. */
	formatOptions?: NumberFormatOptions;

	/** Classes for the displayed number */
	textClassName?: string;
}

/**
 * A numeric input that accepts and emits numbers, on every platform.
 * Uses internal string state to allow typing decimals freely.
 * Shows the formatted number at rest and the raw editable string while focused.
 * Emits number on blur.
 */
export function NumberInput({
	value,
	onChangeText,
	formatOptions,
	onBlur,
	onFocus,
	inputClassName,
	textClassName,
	ref,
	...props
}: NumberInputProps) {
	const { store } = useAppState();
	const decimalSeparator = useDocField(store, (state) => state.price_decimal_sep) || '.';
	const { format } = useNumberFormat(formatOptions);
	const inputRef = React.useRef<TextInputInstance>(null);
	const mergedRef = useMergedRef(ref ?? null, inputRef);

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

	// At rest the field reads formatted; the raw string is what is edited and parsed, so the
	// formatted one (thousands separators, a fixed scale) never reaches `stringToNumber`.
	const shown =
		isFocused || internalValue === '' ? internalValue : format(stringToNumber(internalValue));

	// Emit number on blur
	const handleBlur = React.useCallback(
		(e: any) => {
			setIsFocused(false);
			if (onChangeText) {
				onChangeText(stringToNumber(internalValue));
			}
			onBlur?.(e);
		},
		[internalValue, onChangeText, onBlur, stringToNumber]
	);

	const handleFocus = React.useCallback(
		(e: any) => {
			setIsFocused(true);
			// Native selects on focus BEFORE the swap to the raw string, which then lands the caret
			// at the end: select the raw string again once it renders. The web selects in a timeout.
			if (props.selectTextOnFocus && Platform.OS !== 'web') {
				const length = internalValue.length;
				setTimeout(() => inputRef.current?.setSelection?.(0, length), 0);
			}
			onFocus?.(e);
		},
		[onFocus, props.selectTextOnFocus, internalValue]
	);

	return (
		<Input
			key={syncKey}
			{...props}
			ref={mergedRef}
			inputClassName={cn(inputClassName, textClassName)}
			value={shown}
			onChangeText={setInternalValue}
			onFocus={handleFocus}
			onBlur={handleBlur}
			type="decimal"
		/>
	);
}
