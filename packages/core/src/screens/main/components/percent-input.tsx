import * as React from 'react';

import { NumberInput, type NumberInputProps } from './number-input';
import { PERCENT_FORMAT } from '../hooks/use-number-format';

/** Native: a percentage is the typed field, at hundredths; the web field grows into a keypad. */
export function PercentInput(props: NumberInputProps) {
	return <NumberInput {...props} formatOptions={PERCENT_FORMAT} />;
}
