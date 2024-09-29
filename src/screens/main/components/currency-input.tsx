import * as React from 'react';

import { NumberInput, NumberInputProps } from './number-input';

/**
 *
 */
export const CurrencyInput = (props: NumberInputProps) => {
	return <NumberInput {...props} formatOptions={{ fixedDecimalScale: true }} />;
};
