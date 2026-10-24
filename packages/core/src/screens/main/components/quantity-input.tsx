import * as React from 'react';

import { NumberInput, type NumberInputProps } from './number-input';
import { QUANTITY_FORMAT } from '../hooks/use-number-format';

/** Native: the cart quantity is the numeric field it was; the web box grows into a keypad. */
export function QuantityInput({
	onRemove: _onRemove,
	...props
}: NumberInputProps & { onRemove: () => void }) {
	// A quantity reads at its own scale, never the price's (0.125 is not 0.13).
	return <NumberInput {...props} formatOptions={QUANTITY_FORMAT} />;
}
