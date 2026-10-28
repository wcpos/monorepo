import * as React from 'react';

import round from 'lodash/round';

import { fieldBox } from '@wcpos/components/field-box';
import { Input } from '@wcpos/components/input';
import { cn } from '@wcpos/components/lib/utils';

import type { AmountFieldProps } from './types';
import type { Amount } from './use-amount';

/**
 * Read typed or pasted text with the store's separators. Both separators present: the
 * thousands one is grouping (`1,234.50`, `1.234,50`). A `.` or `,` that occurs twice is
 * grouping. A single `.` or `,` is the decimal point, either way round, so a fr_FR till takes
 * a typed `.`. A space-like thousands separator is never a decimal. Anything else, or two
 * points left over, is NaN: the caller writes nothing.
 */
function parseNumber(text: string, decimal: string, thousands: string): number {
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
 * Native: the typed field (decision 16); Escape puts the stored number back.
 * Uses internal string state to allow typing decimals freely.
 * Emits number on blur, and only a changed one: focusing and leaving writes nothing.
 */
export function TypedField({
	amount,
	onDone,
	onDraftChange,
	ref,
	...props
}: AmountFieldProps & { amount: Amount; onDone?: () => void }) {
	const { decimalSeparator, thousandSeparator, stored, places, commit } = amount;
	const value = props.value ?? stored;

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

	// Blank over a blank amount is no number; blank over a number is 0.
	const stringToNumber = React.useCallback(
		(text: string) =>
			text.trim() === '' && stored === undefined
				? NaN
				: parseNumber(text, decimalSeparator, thousandSeparator),
		[decimalSeparator, thousandSeparator, stored]
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

	// Emit the number on blur only when something was typed and it changes the record: a focus
	// and leave must not write (a blank regular price would become "0"), a typed 0 over a blank
	// must. Unparseable text writes nothing and the field shows the stored value again.
	const handleBlur = React.useCallback(() => {
		setIsFocused(false);
		const typed = stringToNumber(internalValue);
		if (dirty.current && Number.isFinite(typed)) void commit(typed);
		dirty.current = false;
		onDone?.();
	}, [internalValue, commit, onDone, stringToNumber]);

	const handleFocus = React.useCallback(() => {
		setIsFocused(true);
		dirty.current = false;
	}, []);

	const handleChangeText = (text: string) => {
		dirty.current = true;
		setInternalValue(text);
		const typed = stringToNumber(text);
		if (onDraftChange && Number.isFinite(typed)) onDraftChange(round(typed, places));
	};

	return (
		<Input
			key={syncKey}
			ref={ref as React.Ref<never>}
			testID={props.testID}
			placeholder={props.placeholder}
			disabled={props.disabled}
			autoFocus={props.autoFocus}
			aria-labelledby={props['aria-labelledby']}
			aria-describedby={props['aria-describedby']}
			aria-invalid={props['aria-invalid']}
			className={cn(
				props.className,
				props.tone === 'attention' && fieldBox({ state: 'attention' })
			)}
			inputClassName={cn('tabular-nums', props.textClassName)}
			// A tap replaces the number, as a keypad's first key does (not "1" → "31").
			selectTextOnFocus
			value={internalValue}
			onChangeText={handleChangeText}
			onFocus={handleFocus}
			onBlur={handleBlur}
			onKeyPress={(event) => {
				if (event.nativeEvent.key !== 'Escape') return;
				dirty.current = false;
				setInternalValue(displayValue);
				onDone?.();
			}}
			type="decimal"
		/>
	);
}
