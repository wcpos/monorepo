import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import { useQueryManager } from '@wcpos/query';

import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';
import {
	documentRecordId,
	insertEngineResident,
	useLocalMutation,
} from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type FeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];
type ShippingLine = NonNullable<import('@wcpos/database').OrderDocument['shipping_lines']>[number];
type CouponLine = NonNullable<import('@wcpos/database').OrderDocument['coupon_lines']>[number];
type CartLine = LineItem | FeeLine | ShippingLine | CouponLine;
type CartLineType = 'line_items' | 'fee_lines' | 'shipping_lines' | 'coupon_lines';

export const useAddItemToOrder = () => {
	const { currentOrder, setCurrentOrderID } = useCurrentOrder();
	const manager = useQueryManager();
	const { localPatch } = useLocalMutation();

	/**
	 *
	 */
	const saveNewOrder = React.useCallback(
		async (type: CartLineType, data: CartLine) => {
			const order = currentOrder.getLatest();
			const date_created_gmt = convertLocalDateToUTCString(new Date());

			const orderJSON: Record<string, unknown> = {
				...order.toJSON(),
				date_created_gmt,
				[type]: [data],
			};
			const recordId = documentRecordId(order);
			if (!recordId) throw new Error('New order is missing its uuid');
			const resident = await insertEngineResident({
				manager,
				collection: 'orders',
				recordId,
				payload: orderJSON,
			});
			await manager.engine.write({
				collection: 'orders',
				operation: 'create',
				recordId,
				payload: resident.get('payload') as Record<string, unknown>,
			});
			await order.remove();
			setCurrentOrderID(recordId);
			return resident;
		},
		[currentOrder, manager, setCurrentOrderID]
	);

	/**
	 * NOTE: If I don't include getLatest(), the populate() will return old data
	 */
	const addItemToOrder = React.useCallback(
		async (type: CartLineType, data: CartLine) => {
			const order = currentOrder.getLatest();

			// make sure items have a uuid before saving
			data.meta_data = data.meta_data || [];
			const meta = data.meta_data.find((meta: any) => meta.key === '_woocommerce_pos_uuid');
			const metaUUID = meta && meta.value;

			if (!metaUUID) {
				data.meta_data.push({
					key: '_woocommerce_pos_uuid',
					value: uuidv4(),
				});
			}

			if ((order as unknown as { isNew?: boolean }).isNew) {
				return saveNewOrder(type, data);
			} else {
				return localPatch({
					document: order,
					data: {
						[type]: [...((order[type] as CartLine[] | undefined) ?? []), data],
					} as never,
				});
			}
		},
		[currentOrder, localPatch, saveNewOrder]
	);

	return { addItemToOrder };
};
