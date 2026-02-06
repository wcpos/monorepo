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
				label: t('common.in_stock'),
				value: 'instock',
			},
			{
				label: t('common.out_of_stock'),
				value: 'outofstock',
			},
			{
				label: t('common.on_backorder'),
				value: 'onbackorder',
			},
			// There is no low stock status in WC
			// {
			// 	label: t('common.low_stock'),
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
