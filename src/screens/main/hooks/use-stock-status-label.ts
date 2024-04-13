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
				label: t('In Stock', { _tags: 'core' }),
				value: 'instock',
			},
			{
				label: t('Out of Stock', { _tags: 'core' }),
				value: 'outofstock',
			},
			{
				label: t('On Backorder', { _tags: 'core' }),
				value: 'onbackorder',
			},
			{
				label: t('Low Stock', { _tags: 'core' }),
				value: 'lowstock',
			},
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
