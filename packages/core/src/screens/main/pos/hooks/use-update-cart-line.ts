import * as React from 'react';

import { calculateCartLine, type EngineWarning } from '@wcpos/order-math';
import { wooMetaCarrier } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { reportStaleCartLine } from './cart-failure';
import { enqueueOrderMutation, type OrderMutationContext } from './order-mutation-queue';
import './stock-guard-hook';
import { useActionContext } from './use-action-context';
import { useCartConfig } from './use-cart-config';
import { extractLineItemData } from './utils';
import {
	dispatchAction,
	isActionRefusal,
	presentActionRefusal,
} from '../../../../extensions/actions';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { type CurrentOrderRecord, useCurrentOrderActions } from '../contexts/current-order';
import { useReportEngineWarnings } from '../contexts/order-engine-warnings';

type OrderDocument = import('@wcpos/database').OrderDocument;
type LineItem = NonNullable<OrderDocument['line_items']>[number];
type FeeLine = NonNullable<OrderDocument['fee_lines']>[number];
type ShippingLine = NonNullable<OrderDocument['shipping_lines']>[number];
interface LineItemChanges extends Partial<Omit<LineItem, 'price'>> {
	price?: number;
	regular_price?: number;
	tax_status?: 'taxable' | 'none';
	virtual?: boolean;
	downloadable?: boolean;
	categories?: { id: number; name: string }[];
}
interface FeeLineChanges extends Partial<FeeLine> {
	amount?: string;
	percent?: boolean;
	prices_include_tax?: boolean;
	percent_of_cart_total_with_tax?: boolean;
}
interface ShippingLineChanges extends Partial<ShippingLine> {
	amount?: number;
	prices_include_tax?: boolean;
	tax_status?: 'taxable' | 'none';
}
export interface CartLineChanges {
	line_items: LineItemChanges;
	fee_lines: FeeLineChanges;
	shipping_lines: ShippingLineChanges;
}
type EditableLineType = keyof CartLineChanges;
export interface UpdateCartLineOptions {
	skipStockGuard?: boolean;
}
const lineInfo = {
	line_items: {
		logger: getLogger(['wcpos', 'pos', 'cart', 'line-item']),
		label: 'Line item',
		site: 'useUpdateLineItem',
		staleKey: 'pos_cart.update_line_not_found',
	},
	fee_lines: {
		logger: getLogger(['wcpos', 'pos', 'cart', 'fee-line']),
		label: 'Fee line',
		site: 'useUpdateFeeLine',
		staleKey: 'pos_cart.update_fee_not_found',
	},
	shipping_lines: {
		logger: getLogger(['wcpos', 'pos', 'cart', 'shipping-line']),
		label: 'Shipping line',
		site: 'useUpdateShippingLine',
		staleKey: 'pos_cart.update_shipping_not_found',
	},
} as const;

/** The bottom handler for cart.line.update; every edit captures its order at press time. */
export const useUpdateCartLine = () => {
	const { getCurrentOrderRecord } = useCurrentOrderActions();
	const { localPatch } = useLocalMutation();
	const cartConfig = useCartConfig();
	const reportEngineWarnings = useReportEngineWarnings();
	const { ctx, actor } = useActionContext();
	const write = React.useCallback(
		async (
			record: CurrentOrderRecord,
			type: EditableLineType,
			uuid: string,
			changes: Record<string, unknown>
		) => {
			const order = record.getLatest();
			const json = order.toMutableJSON().payload;
			let updated = false;
			let warnings: readonly EngineWarning[] = [];
			const previous = json[type]?.find((line) => wooMetaCarrier.lineUuid(line) === uuid);
			const updatedLines = json[type]?.map((line) => {
				if (updated || wooMetaCarrier.lineUuid(line) !== uuid) return line;
				// Fee basis and shipping inheritance come from the SAME snapshot being patched.
				// Product lines must not receive cartLineItems: these are distinct engine inputs.
				const calculated =
					type === 'line_items'
						? calculateCartLine(
								{ kind: 'line_item', line: line as LineItem, changes: changes as LineItemChanges },
								cartConfig
							)
						: type === 'fee_lines'
							? calculateCartLine(
									{
										kind: 'fee',
										line: line as FeeLine,
										changes: changes as FeeLineChanges,
										cartLineItems: json.line_items ?? [],
									},
									cartConfig
								)
							: calculateCartLine(
									{
										kind: 'shipping',
										line: line as ShippingLine,
										changes: changes as ShippingLineChanges,
										cartLineItems: json.line_items ?? [],
									},
									cartConfig
								);
				updated = true;
				warnings = calculated.warnings;
				return calculated.line;
			});
			reportEngineWarnings(warnings, { orderId: order.uuid, site: lineInfo[type].site });
			if (!updated || !updatedLines) return;
			const result = await localPatch({ document: order, data: { [type]: updatedLines } });
			if (result && type === 'line_items' && previous) {
				const line = previous as LineItem;
				lineInfo[type].logger.info('Cart line item updated', {
					context: {
						event: 'cart.line-item.updated',
						orderId: order.uuid ?? order.payload.id,
						productName: line.name,
						previousQuantity: line.quantity,
						quantity: changes.quantity,
						previousPrice: extractLineItemData(line, cartConfig.pricesIncludeTax).price,
						price: changes.price,
					},
				});
			}
			return result;
		},
		[cartConfig, localPatch, reportEngineWarnings]
	);
	const apply = React.useCallback(
		async (
			record: CurrentOrderRecord,
			queue: OrderMutationContext,
			type: EditableLineType,
			uuid: string,
			changes: Record<string, unknown> | number,
			options?: UpdateCartLineOptions
		) => {
			const target = queue.order ?? record;
			const order = target.getLatest();
			const json = order.toMutableJSON().payload;
			const line = json[type]?.find((item) => wooMetaCarrier.lineUuid(item) === uuid);
			if (!line) {
				const info = lineInfo[type];
				reportStaleCartLine(
					info.logger,
					`${info.label} update targeted a line that is no longer in the cart`,
					{
						toastTitle: ctx.t(info.staleKey),
						context: { uuid, orderId: order.payload.id },
					}
				);
				return;
			}
			const result = await dispatchAction({
				event: 'cart.line.update',
				token: queue.dispatchToken,
				ctx,
				input: {
					orderId: order.uuid,
					actor,
					source: 'user',
					payload: {
						type,
						lineUuid: uuid,
						changes:
							typeof changes === 'number'
								? { quantity: ((line as LineItem).quantity ?? 0) + changes }
								: changes,
						line,
						lineItems: json.line_items ?? [],
						options: { skipStockGuard: options?.skipStockGuard },
					},
				},
				bottom: (e) => write(target, type, uuid, { ...e.payload.changes }),
			});
			if (isActionRefusal(result)) {
				presentActionRefusal(ctx, result, { orderId: order.uuid, uuid });
				return false;
			}
			return result as Awaited<ReturnType<typeof localPatch>> | undefined;
		},
		[actor, ctx, write]
	);
	const updateCartLine = React.useCallback(
		async <T extends EditableLineType>(
			type: T,
			uuid: string,
			changes: CartLineChanges[T],
			options?: UpdateCartLineOptions
		) => {
			const record = getCurrentOrderRecord();
			if (!record.uuid) throw new Error('Order is missing its uuid');
			return enqueueOrderMutation(record.uuid, (queue) =>
				apply(record, queue, type, uuid, { ...changes }, options)
			);
		},
		[apply, getCurrentOrderRecord]
	);
	const incrementLineItem = React.useCallback(
		async (uuid: string, by: number) => {
			const record = getCurrentOrderRecord();
			if (!record.uuid) throw new Error('Order is missing its uuid');
			return enqueueOrderMutation(record.uuid, (queue) =>
				apply(record, queue, 'line_items', uuid, by)
			);
		},
		[apply, getCurrentOrderRecord]
	);
	return { updateCartLine, incrementLineItem };
};
