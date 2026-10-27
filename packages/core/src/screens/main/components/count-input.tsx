import * as React from 'react';

import { QuantityInput } from './quantity-input';

/**
 * A whole count from 0 (a product's stock, a refund's quantity): the cart's quantity keypad on
 * web, with no remove and no decimal key (Paul 2026-10-27); the numeric field on native.
 */
export function CountInput(
	props: Omit<React.ComponentProps<typeof QuantityInput>, 'decimals' | 'onRemove'>
) {
	return <QuantityInput {...props} decimals={0} />;
}
