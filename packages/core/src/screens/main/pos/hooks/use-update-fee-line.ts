import * as React from 'react';

import { type CartLineChanges, useUpdateCartLine } from './use-update-cart-line';

export const useUpdateFeeLine = () => {
	const { updateCartLine } = useUpdateCartLine();
	const updateFeeLine = React.useCallback(
		(uuid: string, changes: CartLineChanges['fee_lines']) =>
			updateCartLine('fee_lines', uuid, changes),
		[updateCartLine]
	);
	return { updateFeeLine };
};
