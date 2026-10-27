import * as React from 'react';

import { NumberInput } from './number-input';

import type { NumberInputProps } from './number-input';

/** Native: the typed field, which takes what is typed; the web field grows into the price keypad. */
export function CurrencyInput({
	decimals: _decimals,
	...props
}: NumberInputProps & { decimals?: number }) {
	return <NumberInput {...props} formatOptions={{ fixedDecimalScale: true }} />;
}
