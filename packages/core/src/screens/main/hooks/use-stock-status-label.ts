import * as React from 'react';

import { useT } from '../../../contexts/translations';

/**
 *
 */
export const useStockStatusLabel = () => {
	const t = useT();

	/**
	 * @TODO - fetch from WC REST API
	 */
	const items = React.useMemo(
		() => [
			{
				label: t('In Stock'),
				value: 'instock',
			},
			{
				label: t('Out of Stock'),
				value: 'outofstock',
			},
			{
				label: t('On Backorder'),
				value: 'onbackorder',
			},
			// There is no low stock status in WC
			// {
			// 	label: t('Low Stock'),
			// 	value: 'lowstock',
			// },
		],
		[t]
	);

	/**
	 * A helper function to get the label for a status
	 */
	const getLabel = React.useCallback(
		(status: string) => {
			const item = items.find((item) => item.value === status);
			if (item) {
				return item.label;
			}
			return status;
		},
		[items]
	);

	return { items, getLabel };
};
