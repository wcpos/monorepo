import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import { useQueryManager } from '@wcpos/query';
import { wrapEngineDocument } from '@wcpos/query/engine-compat';

import { useCartStockGuard } from './use-cart-stock-guard';
import { enqueueOrderMutation } from './order-mutation-queue';
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
	const { stockGuardEnabled, checkCartStock, showBackorderWarning } = useCartStockGuard();

	/**
	 *
	 */
	const saveNewOrder = React.useCallback(
		async (order: import('@wcpos/database').OrderDocument, type: CartLineType, data: CartLine) => {
			const date_created_gmt = convertLocalDateToUTCString(new Date());

			const orderJSON: Record<string, unknown> = {
				...order.toMutableJSON(),
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
				payload: resident.toMutableJSON().payload as Record<string, unknown>,
			});
			const savedOrder = wrapEngineDocument(
				'orders',
				resident as never
			) as unknown as import('@wcpos/database').OrderDocument;
			await order.remove();
			setCurrentOrderID(recordId);
			return savedOrder;
		},
		[manager, setCurrentOrderID]
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

			const recordId = documentRecordId(order);
			if (!recordId) throw new Error('Order is missing its uuid');
			return enqueueOrderMutation(recordId, async (context) => {
				const latest = context.order?.getLatest() ?? order.getLatest();
				const isNew = Boolean((latest as unknown as { isNew?: boolean }).isNew);
				let stockWarningName: string | null = null;
				if (type === 'line_items' && stockGuardEnabled && (data as LineItem).product_id !== 0) {
					const lineItem = data as LineItem;
					const stockResult = await checkCartStock({
						lineItems: latest.line_items ?? [],
						productId: lineItem.product_id ?? 0,
						variationId: lineItem.variation_id ?? 0,
						requestedQuantity: lineItem.quantity ?? 1,
						name: lineItem.name,
					});
					if (!stockResult.allowed) return false;
					if (stockResult.warning === 'backorder') {
						stockWarningName = stockResult.name;
					}
				}

				const result = isNew
					? await saveNewOrder(latest, type, data)
					: await localPatch({
							document: latest,
							data: {
								[type]: [...((latest[type] as CartLine[] | undefined) ?? []), data],
							} as never,
						});
				if (isNew) context.order = result;
				if (stockWarningName !== null) showBackorderWarning(stockWarningName);
				return result;
			});
		},
		[
			checkCartStock,
			currentOrder,
			localPatch,
			saveNewOrder,
			showBackorderWarning,
			stockGuardEnabled,
		]
	);

	return { addItemToOrder };
};
