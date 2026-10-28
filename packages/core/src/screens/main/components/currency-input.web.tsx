import * as React from 'react';

import { MoneyInput } from './money-input';
import { useNumberFormat } from '../hooks/use-number-format';

import type { FormFieldAria, KeypadFieldHandle } from './money-input';
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
	'aria-describedby': describedBy,
	'aria-invalid': invalid,
	decimals,
}: Omit<NumberInputProps, 'ref'> &
	FormFieldAria & {
		ref?: React.Ref<KeypadFieldHandle>;
		/** The places a refund is validated to, when they are not the store's price places. */
		decimals?: number;
	}) {
	const formatOptions = React.useMemo(
		() => (decimals === undefined ? MONEY_FORMAT : { ...MONEY_FORMAT, decimalScale: decimals }),
		[decimals]
	);
	const { format } = useNumberFormat(formatOptions);
	return (
		<MoneyInput
			field
			ref={ref}
			value={value}
			format={format}
			decimals={decimals}
			disabled={disabled}
			placeholder={placeholder}
			aria-labelledby={labelledBy}
			aria-describedby={describedBy}
			aria-invalid={invalid}
			testID={testID}
			onChangeText={(next) => onChangeText?.(next)}
		/>
	);
}
