import * as React from 'react';

import { useDocField } from '@wcpos/query';

import { useT } from '../../../contexts/translations';
import { useExtraData } from '../contexts/extra-data';

interface OrderStatus {
	label: string;
	status: string;
}

export const useOrderStatusLabel = () => {
	const t = useT();
	const { extraData } = useExtraData();
	let orderStatuses = useDocField(extraData, (value) => value.orderStatuses) as
		OrderStatus[] | unknown;
	if (!Array.isArray(orderStatuses)) {
		orderStatuses = [] as OrderStatus[];
	}

	// orders/LEDGER.md rule 45: synthetic POS statuses use the app's keys; real WooCommerce statuses keep the server's label.
	const posLabel = React.useCallback(
		(status: string) =>
			status === 'pos-open'
				? t('orders.status.pos-open')
				: status === 'pos-partial'
					? t('orders.status.pos-partial')
					: undefined,
		[t]
	);

	/**
	 * Put the order statuses into a format that can be used by a select input
	 */
	const items = React.useMemo(
		() =>
			(orderStatuses as OrderStatus[]).map((item: OrderStatus) => ({
				label: posLabel(item.status) ?? item.label,
				value: item.status,
			})),
		[orderStatuses, posLabel]
	);

	/**
	 * A helper function to get the label for a status
	 */
	const getLabel = React.useCallback(
		(status: string) => {
			const pos = posLabel(status);
			if (pos !== undefined) {
				return pos;
			}
			const item = (orderStatuses as OrderStatus[]).find(
				(item: OrderStatus) => item.status === status
			);
			if (item) {
				return item.label;
			}
			return status;
		},
		[orderStatuses, posLabel]
	);

	return { items, getLabel };
};
