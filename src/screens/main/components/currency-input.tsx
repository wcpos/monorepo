import * as React from 'react';

import { NumberInput, NumberInputProps } from './number-input';

/**
 *
 */
export const CurrencyInput = React.forwardRef<
	React.ElementRef<typeof NumberInput>,
	NumberInputProps
>((props, ref) => {
	return <NumberInput ref={ref} {...props} formatOptions={{ fixedDecimalScale: true }} />;
});
