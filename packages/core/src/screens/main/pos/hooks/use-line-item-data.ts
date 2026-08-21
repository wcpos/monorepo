import * as React from 'react';

import { useDocField } from '@wcpos/query';

import { extractLineItemData } from './utils';
import { useAppState } from '../../../../contexts/app-state';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];

/**
 * Custom hook to handle LineItem data.
 */
export const useLineItemData = () => {
	const { store } = useAppState();
	const pricesIncludeTax = useDocField(store, (value) => value.prices_include_tax) === 'yes';

	/**
	 * Retrieves and processes the line item data.
	 */
	const getLineItemData = React.useCallback(
		(item: LineItem) => extractLineItemData(item, pricesIncludeTax),
		[pricesIncludeTax]
	);

	return { getLineItemData };
};
