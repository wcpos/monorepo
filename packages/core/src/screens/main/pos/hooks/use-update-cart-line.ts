import * as React from 'react';

import { calculateCartLine, type EngineWarning } from '@wcpos/order-math';
import { wooMetaCarrier } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { reportStaleCartLine } from './cart-failure';
import { enqueueCartAction } from './enqueue-cart-action';
import './stock-guard-hook';
import { useActionContext } from './use-action-context';
import { useCartConfig } from './use-cart-config';
import { extractLineItemData } from './utils';
import {
	type ActionContext,
	type ActionRefusal,
	dispatchAction,
	isActionRefusal,
} from '../../../../extensions/actions';
import { useCartWrite } from '../commands/use-cart-write';
import { type CurrentOrderRecord, useCurrentOrderActions } from '../contexts/current-order';
import { useReportEngineWarnings } from '../contexts/order-engine-warnings';

import type { OrderMutationContext } from './order-mutation-queue';

type OrderDocument = import('@wcpos/query').OrderPayload;
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
		site: 'useUpdateCartLine:line_items',
		stale: (t: ActionContext['t']) => t('pos_cart.update_line_not_found'),
	},
	fee_lines: {
		logger: getLogger(['wcpos', 'pos', 'cart', 'fee-line']),
		label: 'Fee line',
		site: 'useUpdateCartLine:fee_lines',
		stale: (t: ActionContext['t']) => t('pos_cart.update_fee_not_found'),
	},
	shipping_lines: {
		logger: getLogger(['wcpos', 'pos', 'cart', 'shipping-line']),
		label: 'Shipping line',
		site: 'useUpdateCartLine:shipping_lines',
		stale: (t: ActionContext['t']) => t('pos_cart.update_shipping_not_found'),
	},
} as const;

/**
 * The bottom handler for cart.line.update takes the order it must operate on rather than
 * resolving the CURRENT one.
 *
 * These mutations are queued, so execution can be arbitrarily later than the press. If
 * this resolved `getCurrentOrderRecord()` at execution time, a cashier who switched order tabs
 * while a mutation was still queued would have it applied to the wrong order: the queue is
 * keyed by the order that was selected at enqueue time, so the edit either lands in the
 * new order or is silently dropped when its line is not found there.
 *
 * The caller captures the order at press time and threads it through. `getLatest()` still
 * gets the freshest revision — of that order.
 */
export const useUpdateCartLine = () => {
	const { getCurrentOrderRecord } = useCurrentOrderActions();
	const { localPatch } = useCartWrite();
	const cartConfig = useCartConfig();
	const reportEngineWarnings = useReportEngineWarnings();
	const { ctx, actor } = useActionContext();
	const write = React.useCallback(
		async (
			record: CurrentOrderRecord,
			type: EditableLineType,
			uuid: string,
			changes: Record<string, unknown>,
			queue: OrderMutationContext
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
			const result = await localPatch({ document: order, queue, data: { [type]: updatedLines } });
			if (result && !isActionRefusal(result) && type === 'line_items' && previous) {
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
			target: CurrentOrderRecord,
			queue: OrderMutationContext,
			type: EditableLineType,
			uuid: string,
			changes: Record<string, unknown> | number,
			options?: UpdateCartLineOptions
		) => {
			const order = target.getLatest();
			const json = order.toMutableJSON().payload;
			const line = json[type]?.find((item) => wooMetaCarrier.lineUuid(item) === uuid);
			if (!line) {
				if (typeof changes === 'number') return;
				const info = lineInfo[type];
				reportStaleCartLine(
					info.logger,
					`${info.label} update targeted a line that is no longer in the cart`,
					{
						toastTitle: info.stale(ctx.t),
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
						options:
							options?.skipStockGuard === undefined
								? {}
								: { skipStockGuard: options.skipStockGuard },
					},
				},
				bottom: (e) => write(target, type, uuid, { ...e.payload.changes }, queue),
			});
			return result as Awaited<ReturnType<typeof localPatch>> | undefined | ActionRefusal;
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
			return enqueueCartAction(
				record,
				(target, queue) => apply(target, queue, type, uuid, { ...changes }, options),
				{ ctx, context: { orderId: record.uuid, uuid } }
			);
		},
		[apply, ctx, getCurrentOrderRecord]
	);
	const incrementLineItem = React.useCallback(
		async (uuid: string, by: number) => {
			const record = getCurrentOrderRecord();
			if (!record.uuid) throw new Error('Order is missing its uuid');
			return enqueueCartAction(
				record,
				(target, queue) => apply(target, queue, 'line_items', uuid, by),
				{ ctx, context: { orderId: record.uuid, uuid } }
			);
		},
		[apply, ctx, getCurrentOrderRecord]
	);
	return { updateCartLine, incrementLineItem };
};
