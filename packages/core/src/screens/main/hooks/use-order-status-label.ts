import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { useExtraData } from '../contexts/extra-data';

interface OrderStatus {
	label: string;
	status: string;
}

export const useOrderStatusLabel = () => {
	const { extraData } = useExtraData();
	let orderStatuses = useObservableEagerState(extraData.orderStatuses$) as OrderStatus[] | unknown;
	if (!Array.isArray(orderStatuses)) {
		orderStatuses = [] as OrderStatus[];
	}

	/**
	 * Put the order statuses into a format that can be used by a select input
	 */
	const items = React.useMemo(
		() =>
			(orderStatuses as OrderStatus[]).map((item: OrderStatus) => ({
				label: item.label,
				value: item.status,
			})),
		[orderStatuses]
	);

	/**
	 * A helper function to get the label for a status
	 */
	const getLabel = React.useCallback(
		(status: string) => {
			const item = (orderStatuses as OrderStatus[]).find(
				(item: OrderStatus) => item.status === status
			);
			if (item) {
				return item.label;
			}
			return status;
		},
		[orderStatuses]
	);

	return { items, getLabel };
};
