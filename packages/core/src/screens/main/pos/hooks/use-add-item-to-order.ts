import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import { calculateCartLine, type CartConfig } from '@wcpos/order-math';
import { type EngineRecord, inOpenOrdersScope, useDocField, useQueryRuntime } from '@wcpos/query';
import { isMiscProductLine, POS_META_KEYS, wooMetaCarrier } from '@wcpos/sync-core';
import { birthOrder, documentRecordId, findBirthState } from '@wcpos/query/mutations';
import { boundRegisterIdOf } from '@wcpos/query/register-session';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useCartWrite } from '../commands/use-cart-write';
import { useRegister } from '../../../../services/register/use-register';
import { scopedRegisterId } from '../../../../services/register/use-register-binding';
import { useCartConfigReader } from './use-cart-config';
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
const kinds = { line_items: 'line_item', fee_lines: 'fee', shipping_lines: 'shipping' } as const;
const cartLogger = getLogger(['wcpos', 'pos', 'cart']);
type MetaData = Parameters<typeof inOpenOrdersScope>[0];
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
	const { settledWrite, settleIntent } = useCartWrite();
	const { ctx, actor, readCounting } = useActionContext();
	const configForOrder = useCartConfigReader();
	const reportEngineWarnings = useReportEngineWarnings();
	const { store, wpCredentials, site } = useStoreSession();
	const register = useRegister();
	const taxBasedOn = useDocField(store, (value) => value.tax_based_on) as string | undefined;
	const identity = React.useMemo(
		() => ({
			userId: wpCredentials.id!,
			tillId: register?.id,
			registerId: boundRegisterIdOf(register, site.uuid!, store.id) ?? undefined,
			storeId: store.id!,
			taxBasedOn,
		}),
		[store.id, taxBasedOn, wpCredentials.id, register, site.uuid]
	);

	/**
	 * A birth or restart rewrites the order's identity; one the cart's own scope cannot match
	 * would be written out of view (#3358). False (logged, not written) when it would.
	 */
	const inCartScope = React.useCallback(
		(orderId: string | undefined, metaData: MetaData) => {
			const registerId = scopedRegisterId(site.uuid!, store.id);
			if (inOpenOrdersScope(metaData, wpCredentials.id!, store.id, registerId)) return true;
			const stamped = wooMetaCarrier.readIdentity(metaData);
			cartLogger.error("Cart add refused: the order would fall outside this till's open orders", {
				code: ERROR_CODES.CART_UPDATE_FAILED,
				context: {
					orderId,
					stampedCashierId: stamped.cashierId,
					stampedStoreId: stamped.storeId,
					stampedRegisterId: stamped.registerId ?? null,
					scopeCashierId: wpCredentials.id,
					scopeStoreId: store.id ?? null,
					scopeRegisterId: registerId,
				},
			});
			return false;
		},
		[site.uuid, store.id, wpCredentials.id]
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
		(
			orderId: string | undefined,
			existing: CartLine[],
			type: CartLineType,
			data: CartLine,
			cartConfig: CartConfig
		) => {
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
		[reportEngineWarnings]
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
			options: {
				orphanedSkeleton: EngineRecord<'orders'> | null;
				priorPayload: CurrentOrderRecord['payload'];
			}
		) => {
			const date_created_gmt = convertLocalDateToUTCString(new Date());

			const recordId = documentRecordId(order);
			if (!recordId) throw new Error('New order is missing its uuid');
			const orphanedSkeleton = options?.orphanedSkeleton ?? null;
			let payload: Record<string, unknown>;
			if (orphanedSkeleton) {
				const priorPayload = options.priorPayload;
				payload = settleIntent(orphanedSkeleton, {
					[type]: buildCartLines(
						recordId,
						(priorPayload[type] as CartLine[] | undefined) ?? [],
						type,
						data,
						configForOrder(priorPayload)
					),
					meta_data: ensurePosOrderIdentityMeta(
						priorPayload.meta_data as Parameters<typeof ensurePosOrderIdentityMeta>[0],
						identity,
						true
					),
				});
			} else {
				const orderData = options.priorPayload;
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
			if (!inCartScope(recordId, payload.meta_data as MetaData)) return null;
			const savedOrder = await birthOrder(runtime, {
				recordId,
				payload,
				orphan: orphanedSkeleton,
			});
			setCurrentOrderID(recordId);
			return savedOrder;
		},
		[
			buildCartLines,
			configForOrder,
			identity,
			inCartScope,
			runtime,
			setCurrentOrderID,
			settleIntent,
		]
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
						latest = latest.getLatest();
						const incoming = e.payload.line as CartLine;
						const temporaryOrder = order.getLatest();
						const priorPayload = isNew ? latest.toMutableJSON().payload : latest.payload;
						if (isNew)
							priorPayload.meta_data = [
								...(priorPayload.meta_data ?? []).filter(
									({ key }) => key !== POS_META_KEYS.vatExempt
								),
								...(temporaryOrder.payload.meta_data ?? []).filter(
									({ key }) => key === POS_META_KEYS.vatExempt
								),
							];
						const cartConfig = configForOrder(priorPayload);

						const { line: data, warnings } =
							type === 'coupon_lines'
								? { line: incoming, warnings: [] }
								: calculateCartLine(
										{
											kind: kinds[type],
											line: incoming,
											cartLineItems: priorPayload.line_items ?? [],
										},
										cartConfig
									);
						reportEngineWarnings(warnings, {
							orderId: latest.uuid,
							site: 'useAddItemToOrder',
						});
						let result;
						if (isNew) {
							const savedOrder = await saveNewOrder(temporaryOrder, type, data, {
								priorPayload,
								orphanedSkeleton,
							});
							if (!savedOrder) return null;
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
							if (
								'meta_data' in restart &&
								!inCartScope(latest.uuid, restart.meta_data as MetaData)
							)
								return null;
							result = await settledWrite({
								queue: context,
								document: latest,
								data: {
									...restart,
									[type]: buildCartLines(
										latest.uuid,
										(latest.payload[type] as CartLine[] | undefined) ?? [],
										type,
										data,
										cartConfig
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
			configForOrder,
			ctx,
			actor,
			getCurrentOrderRecord,
			identity,
			inCartScope,
			settledWrite,
			runtime,
			reportEngineWarnings,
			saveNewOrder,
			setCurrentOrderID,
			site,
			store,
		]
	);

	return { addItemToOrder, readCounting };
};
