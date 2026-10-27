import * as React from 'react';

import { MoneyInput } from './money-input';
import { useNumberFormat } from '../hooks/use-number-format';

import type { KeypadFieldHandle } from './money-input';
import type { NumberInputProps } from './number-input';

/** The field's own text at rest, as the typed field read it: `10.00`, no currency symbol. */
const MONEY_FORMAT = { fixedDecimalScale: true };

/**
 * Web: a form's money field grows into the cart's price keypad (Paul 2026-10-27), outlined at
 * rest and without quick keys. Native keeps the typed field (decision 16).
 */
export function CurrencyInput({
	value,
	onChangeText,
	disabled,
	placeholder,
	testID,
	ref,
	'aria-labelledby': labelledBy,
}: Omit<NumberInputProps, 'ref'> & { ref?: React.Ref<KeypadFieldHandle> }) {
	const { format } = useNumberFormat(MONEY_FORMAT);
	return (
		<MoneyInput
			field
			ref={ref}
			value={value}
			format={format}
			disabled={disabled}
			placeholder={placeholder}
			aria-labelledby={labelledBy}
			testID={testID}
			onChangeText={(next) => onChangeText?.(next)}
		/>
	);
}
