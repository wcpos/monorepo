import * as React from 'react';

import { NumberInput, type NumberInputProps } from './number-input';

/** Native: the cart quantity is the numeric field it was; the web box grows into a keypad. */
export function QuantityInput({
	onRemove: _onRemove,
	...props
}: NumberInputProps & { onRemove: () => void }) {
	return <NumberInput {...props} />;
}
