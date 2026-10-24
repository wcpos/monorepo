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

	/** Called on every text change with the raw text, readable or not */
	onDraftChange?: (text: string) => void;

	/** Web: how the number reads while the field is not focused (`3.20`); focused, the raw `3.2`. */
	formatOptions?: NumberFormatOptions;

	/** Classes for the displayed number */
	textClassName?: string;
}

/**
 * Read typed or pasted text with the store's separators. Both separators present: the
 * thousands one is grouping (`1,234.50`, `1.234,50`). A `.` or `,` that occurs twice is
 * grouping. A single `.` or `,` is the decimal point, either way round, so a fr_FR till takes
 * a typed `.`. A space-like thousands separator is never a decimal. Anything else, or two
 * points left over, is NaN: the caller writes nothing.
 */
export function parseNumber(text: string, decimal: string, thousands: string): number {
	let t = text.trim();
	if (t === '' || t === '-') return 0;
	if (thousands && thousands !== decimal && t.includes(thousands) && t.includes(decimal)) {
		t = t.split(thousands).join('').replace(decimal, '.');
	} else {
		if (thousands && thousands !== '.' && thousands !== ',') t = t.split(thousands).join('');
		for (const sep of ['.', ',']) if (t.split(sep).length > 2) t = t.split(sep).join('');
		t = t.replace(',', '.');
	}
	return /^-?(\d+\.?\d*|\.\d+)$/.test(t) ? parseFloat(t) : NaN;
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
	const thousandSeparator = useDocField(store, (state) => state.price_thousand_sep) || '';
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

	const stringToNumber = React.useCallback(
		(text: string) => parseNumber(text, decimalSeparator, thousandSeparator),
		[decimalSeparator, thousandSeparator]
	);

	// Internal string state for free-form typing
	const [internalValue, setInternalValue] = React.useState(() => numberToString(value));
	const [isFocused, setIsFocused] = React.useState(false);
	const [syncKey, setSyncKey] = React.useState(0);
	// Typed since this focus: a focus and leave writes nothing, a typed 0 over a blank writes 0.
	const dirty = React.useRef(false);

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
	const restNumber = stringToNumber(internalValue);
	const shown =
		Platform.OS === 'web' && !isFocused && internalValue !== '' && Number.isFinite(restNumber)
			? format(restNumber)
			: internalValue;

	// Emit the number on blur only when something was typed and it changes the record: a focus
	// and leave must not write (a blank regular price would become "0"), a typed 0 over a blank
	// must. Unparseable text writes nothing and the field shows the stored value again.
	const handleBlur = React.useCallback(
		(e: any) => {
			setIsFocused(false);
			const typed = stringToNumber(internalValue);
			const incoming = numberToString(value);
			const changed =
				incoming === '' ? internalValue.trim() !== '' : typed !== stringToNumber(incoming);
			if (onChangeText && dirty.current && Number.isFinite(typed) && changed) {
				onChangeText(typed);
			}
			dirty.current = false;
			onBlur?.(e);
		},
		[internalValue, value, onChangeText, onBlur, stringToNumber, numberToString]
	);

	const handleFocus = React.useCallback(
		(e: any) => {
			setIsFocused(true);
			dirty.current = false;
			onFocus?.(e);
		},
		[onFocus]
	);

	const handleChangeText = React.useCallback(
		(text: string) => {
			dirty.current = true;
			setInternalValue(text);
			onDraftChange?.(text);
		},
		[onDraftChange]
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
