import * as React from 'react';

import { useT } from '../../../contexts/translations';

export const useOrderStatusLabel = () => {
	const t = useT();

	/**
	 * @TODO - fetch from WC REST API
	 */
	const items = React.useMemo(
		() => [
			{
				label: t('Pending', { _tags: 'core' }),
				value: 'pending',
			},
			{
				label: t('Processing', { _tags: 'core' }),
				value: 'processing',
			},
			{
				label: t('On Hold', { _tags: 'core' }),
				value: 'on-hold',
			},
			{
				label: t('Completed', { _tags: 'core' }),
				value: 'completed',
			},
			{
				label: t('Cancelled', { _tags: 'core' }),
				value: 'cancelled',
			},
			{
				label: t('Refunded', { _tags: 'core' }),
				value: 'refunded',
			},
			{
				label: t('Failed', { _tags: 'core' }),
				value: 'failed',
			},
			{
				label: t('Trash', { _tags: 'core' }),
				value: 'trash',
			},
			{
				label: t('POS Open', { _tags: 'core' }),
				value: 'pos-open',
			},
			{
				label: t('POS Partial', { _tags: 'core' }),
				value: 'pos-partial',
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
