import * as React from 'react';

import { type CartLineChanges, useUpdateCartLine } from './use-update-cart-line';

export const useUpdateShippingLine = () => {
	const { updateCartLine } = useUpdateCartLine();
	const updateShippingLine = React.useCallback(
		(uuid: string, changes: CartLineChanges['shipping_lines']) =>
			updateCartLine('shipping_lines', uuid, changes),
		[updateCartLine]
	);
	return { updateShippingLine };
};
