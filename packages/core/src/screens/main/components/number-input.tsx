import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Input, InputProps } from '@wcpos/components/input';

import { useAppState } from '../../../contexts/app-state';
import { NumberFormatOptions } from '../hooks/use-number-format';

export interface NumberInputProps extends Omit<InputProps, 'value' | 'onChangeText' | 'type'> {
	/** The numeric value */
	value?: number | string;

	/** Called when the value changes */
	onChangeText?: (value: number) => void;

	/** Discount presets (used in web numpad) */
	discounts?: number[];

	/** Popover placement (used in web) */
	placement?: 'top' | 'bottom' | 'left' | 'right';

	/** Number formatting options (used in web for display) */
	formatOptions?: NumberFormatOptions;
}

/**
 * A numeric input that accepts and emits numbers.
 * Uses internal string state to allow typing decimals freely.
 * Emits number on blur.
 */
export function NumberInput({
	value,
	onChangeText,
	// These props are accepted for API parity with web but not used in native text input
	discounts: _discounts,
	placement: _placement,
	formatOptions: _formatOptions,
	onBlur,
	onFocus,
	...props
}: NumberInputProps) {
	const { store } = useAppState();
	const decimalSeparator = useObservableEagerState(store.price_decimal_sep$) || '.';

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

	// Sync from parent when value changes externally (and not focused)
	React.useEffect(() => {
		if (!isFocused && value != null) {
			setInternalValue(numberToString(value));
		}
	}, [value, isFocused, numberToString]);

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
			onFocus?.(e);
		},
		[onFocus]
	);

	return (
		<Input
			{...props}
			value={internalValue}
			onChangeText={setInternalValue}
			onFocus={handleFocus}
			onBlur={handleBlur}
			type="decimal"
		/>
	);
}
