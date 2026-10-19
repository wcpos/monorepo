import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import { calculateCartLine } from '@wcpos/order-math';
import { type EngineRecord, useDocField, useQueryRuntime } from '@wcpos/query';
import { isMiscProductLine, wooMetaCarrier } from '@wcpos/sync-core';
import { birthOrder, documentRecordId, findBirthState } from '@wcpos/query/mutations';

import { useCartWrite } from '../commands/use-cart-write';
import { useRegister } from '../../../../services/register/use-register';
import { useCartConfig } from './use-cart-config';
import './stock-guard-hook';
import { useActionContext } from './use-action-context';
import { dispatchAction } from '../../../../extensions/actions';
import { cartRestartsOnAdd, isCartEmpty, restartStamp } from './cart-restart';
import { enqueueCartAction } from './enqueue-cart-action';
import { ensurePosOrderIdentityMeta, findByProductVariationID } from './utils';
import { useStoreSession } from '../../../../contexts/app-state';
import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';
import { resolveDayTimezone } from '../../../../hooks/use-store-day';
import { useCurrentOrderActions } from '../contexts/current-order';
import { useReportEngineWarnings } from '../contexts/order-engine-warnings';

import type { OrderMutationContext } from './order-mutation-queue';
import type { CurrentOrderRecord } from '../contexts/current-order';

type LineItem = NonNullable<EngineRecord<'orders'>['payload']['line_items']>[number];
type FeeLine = NonNullable<EngineRecord<'orders'>['payload']['fee_lines']>[number];
type ShippingLine = NonNullable<EngineRecord<'orders'>['payload']['shipping_lines']>[number];
type CouponLine = NonNullable<EngineRecord<'orders'>['payload']['coupon_lines']>[number];
type CartLine = LineItem | FeeLine | ShippingLine | CouponLine;
type CartLineType = 'line_items' | 'fee_lines' | 'shipping_lines' | 'coupon_lines';
/**
 * Provides the queued mutation used to add a cart line to the current order.
 *
 * @returns An object containing the callback that adds a line to the order.
 */
export const useAddItemToOrder = () => {
	// Event-time resolution: every product tile mounts this hook via useAddProduct, so a
	// render-time subscription re-rendered the whole grid on every cart write.
	const { getCurrentOrderRecord, setCurrentOrderID } = useCurrentOrderActions();
	const runtime = useQueryRuntime();
	const { localPatch, settleIntent } = useCartWrite();
	const { ctx, actor } = useActionContext();
	const cartConfig = useCartConfig();
	const reportEngineWarnings = useReportEngineWarnings();
	const { store, wpCredentials, site } = useStoreSession();
	const register = useRegister();
	const taxBasedOn = useDocField(store, (value) => value.tax_based_on) as string | undefined;
	const identity = React.useMemo(
		() => ({
			userId: wpCredentials.id!,
			tillId: register?.id,
			registerId: register?.sites[site.uuid!]?.register_id ?? undefined,
			storeId: store.id!,
			taxBasedOn,
		}),
		[store.id, taxBasedOn, wpCredentials.id, register, site.uuid]
	);

	/**
	 * Build the cart lines for an add, folding a repeat add into the line it
	 * duplicates.
	 *
	 * useAddProduct/useAddVariation increment an existing line themselves, but their
	 * duplicate check reads `currentOrder` OUTSIDE this hook's mutation queue, so it
	 * can miss a match two ways: against a temporary order it is skipped entirely,
	 * and against a persisted one it reads the cart before an overlapping add has
	 * been written. Either way the repeat add arrives here as an append, and because
	 * those callers only increment when EXACTLY one line matches, a split cart never
	 * merges again.
	 *
	 * Merging only ever fires on that exactly-one-match case — the increment the
	 * caller would have made had it seen the current cart.
	 */
	const buildCartLines = React.useCallback(
		(orderId: string | undefined, existing: CartLine[], type: CartLineType, data: CartLine) => {
			const lineItem = data as LineItem;
			// A miscellaneous product (product_id 0) is always its own line, matching
			// the duplicate check in useAddProduct/useAddVariation.
			if (type !== 'line_items' || lineItem.product_id == null || isMiscProductLine(lineItem)) {
				return [...existing, data];
			}
			const matches = findByProductVariationID(
				existing as LineItem[],
				lineItem.product_id,
				lineItem.variation_id ?? 0
			);
			if (!matches || matches.length !== 1) return [...existing, data];
			const match = matches[0];
			// The merge recomputes an EXISTING line, so an unreadable price basis is
			// reachable here in a way it is not for a line the POS has just authored.
			const { line: merged, warnings } = calculateCartLine(
				{
					kind: 'line_item',
					line: { ...match, quantity: (match.quantity ?? 0) + (lineItem.quantity ?? 1) },
				},
				cartConfig
			);
			reportEngineWarnings(warnings, { orderId, site: 'useAddItemToOrder' });
			return (existing as LineItem[]).map((item) => (item === match ? (merged as LineItem) : item));
		},
		[cartConfig, reportEngineWarnings]
	);

	/**
	 * `orphanedSkeleton` is a resident whose create never reached the write queue;
	 * it is reused (never re-inserted) so the lines it already holds survive the
	 * retry.
	 */
	const saveNewOrder = React.useCallback(
		async (
			order: CurrentOrderRecord,
			type: CartLineType,
			data: CartLine,
			options?: { orphanedSkeleton?: EngineRecord<'orders'> | null }
		) => {
			const date_created_gmt = convertLocalDateToUTCString(new Date());

			const recordId = documentRecordId(order);
			if (!recordId) throw new Error('New order is missing its uuid');
			const orphanedSkeleton = options?.orphanedSkeleton ?? null;
			let payload: Record<string, unknown>;
			if (orphanedSkeleton) {
				const priorPayload = (orphanedSkeleton.toMutableJSON().payload ?? {}) as Record<
					string,
					unknown
				>;
				payload = settleIntent(orphanedSkeleton, {
					[type]: buildCartLines(
						recordId,
						(priorPayload[type] as CartLine[] | undefined) ?? [],
						type,
						data
					),
					meta_data: ensurePosOrderIdentityMeta(
						priorPayload.meta_data as Parameters<typeof ensurePosOrderIdentityMeta>[0],
						identity,
						true
					),
				});
			} else {
				const orderData = order.toMutableJSON().payload;
				const orderJSON: Record<string, unknown> = {
					...orderData,
					meta_data: ensurePosOrderIdentityMeta(
						orderData.meta_data,
						identity,
						isCartEmpty(orderData)
					),
					date_created_gmt,
					[type]: [data],
				};
				payload = settleIntent(order, orderJSON);
			}
			const savedOrder = await birthOrder(runtime, {
				recordId,
				payload,
				orphan: orphanedSkeleton,
			});
			setCurrentOrderID(recordId);
			return savedOrder;
		},
		[buildCartLines, identity, runtime, setCurrentOrderID, settleIntent]
	);

	/**
	 * NOTE: If I don't include getLatest(), the populate() will return old data
	 */
	const addItemToOrder = React.useCallback(
		async (type: CartLineType, data: CartLine) => {
			const order = getCurrentOrderRecord().getLatest();

			data = wooMetaCarrier.ensureLineUuid(data, uuidv4);

			const recordId = documentRecordId(order);
			if (!recordId) throw new Error('Order is missing its uuid');
			const run = async (target: CurrentOrderRecord, context: OrderMutationContext) => {
				const temporaryOrder = order.getLatest();
				let latest = target.getLatest();
				let isNew = Boolean((latest as { isNew?: boolean }).isNew);
				let orphanedSkeleton: EngineRecord<'orders'> | null = null;
				if (isNew && !context.order) {
					const birth = await findBirthState(runtime, recordId);
					if (birth !== 'none') {
						latest = birth.born ?? birth.orphan;
						if (birth.born) {
							context.order = latest;
							isNew = false;
							// The line is going into a resident the cart is NOT showing — it is
							// still rendering the temporary order this uuid was born from. The
							// create path calls this after its own birth; this path must too, or
							// the cart keeps the "new order" tab while the item lands elsewhere.
							setCurrentOrderID(recordId);
						} else {
							// A skeleton whose create never made it to the queue: stay on the
							// create path so it is retried against this resident, instead of
							// patching an order the server has never seen.
							orphanedSkeleton = birth.orphan;
						}
					}
				}

				return dispatchAction({
					event: 'cart.line.add',
					token: context.dispatchToken,
					ctx,
					input: {
						orderId: recordId,
						actor,
						source: 'user',
						payload: { type, line: data, lineItems: latest.payload.line_items ?? [] },
					},
					bottom: async (e) => {
						const data = { ...e.payload.line } as CartLine;
						let result;
						if (isNew) {
							const savedOrder = await saveNewOrder(temporaryOrder, type, data, {
								orphanedSkeleton,
							});
							context.order = savedOrder;
							result = savedOrder;
						} else {
							// A line going into an emptied cart RESTARTS it: the creation time is
							// the start of the sale in front of the cashier, not of the abandoned
							// cart this record began as (cartRestartsOnAdd, monorepo#2183).
							const restart = cartRestartsOnAdd(latest.payload)
								? {
										...restartStamp(new Date(), resolveDayTimezone(store, site).timezone),
										meta_data: ensurePosOrderIdentityMeta(latest.payload.meta_data, identity, true),
									}
								: {};
							result = await localPatch({
								queue: context,
								document: latest,
								data: {
									...restart,
									[type]: buildCartLines(
										latest.uuid,
										(latest.payload[type] as CartLine[] | undefined) ?? [],
										type,
										data
									),
								} as never,
							});
						}
						return result;
					},
				});
			};
			return enqueueCartAction(order, run, { ctx, context: { orderId: recordId } });
		},
		[
			buildCartLines,
			ctx,
			actor,
			getCurrentOrderRecord,
			identity,
			localPatch,
			runtime,
			saveNewOrder,
			setCurrentOrderID,
			site,
			store,
		]
	);

	return { addItemToOrder };
};
