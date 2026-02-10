import * as React from 'react';

import { NumberInput } from './number-input';

import type { NumberInputProps } from './number-input';

/**
 *
 */
export function CurrencyInput(props: NumberInputProps) {
	return <NumberInput {...props} formatOptions={{ fixedDecimalScale: true }} />;
}
