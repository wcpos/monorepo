import * as React from 'react';

import {
	type CartLineChanges,
	type UpdateCartLineOptions,
	useUpdateCartLine,
} from './use-update-cart-line';

export const useUpdateLineItem = () => {
	const { updateCartLine, incrementLineItem } = useUpdateCartLine();
	const updateLineItem = React.useCallback(
		(uuid: string, changes: CartLineChanges['line_items'], options?: UpdateCartLineOptions) =>
			updateCartLine('line_items', uuid, changes, options),
		[updateCartLine]
	);
	return { updateLineItem, incrementLineItem };
};
