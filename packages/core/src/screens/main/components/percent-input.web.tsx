import * as React from 'react';

import { MoneyInput } from './money-input';
import { PERCENT_FORMAT, PERCENT_PLACES, useNumberFormat } from '../hooks/use-number-format';

import type { KeypadFieldHandle } from './money-input';
import type { NumberInputProps } from './number-input';

/**
 * Web: a form's percentage grows into the price keypad, as its money does (Paul 2026-10-27),
 * typed to hundredths with the store's separators. The `%` sits beside the field.
 */
export function PercentInput({
	value,
	onChangeText,
	disabled,
	placeholder,
	testID,
	ref,
	'aria-labelledby': labelledBy,
}: Omit<NumberInputProps, 'ref'> & { ref?: React.Ref<KeypadFieldHandle> }) {
	const { format } = useNumberFormat(PERCENT_FORMAT);
	return (
		<MoneyInput
			field
			ref={ref}
			value={value}
			format={format}
			decimals={PERCENT_PLACES}
			disabled={disabled}
			placeholder={placeholder}
			aria-labelledby={labelledBy}
			testID={testID}
			onChangeText={(next) => onChangeText?.(next)}
		/>
	);
}
