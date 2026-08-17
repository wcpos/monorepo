import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';
import { useObservableEagerState } from 'observable-hooks';

import { useQueryRuntime, wrapEngineDocument } from '@wcpos/query';

import { useCalculateLineItemTaxAndTotals } from './use-calculate-line-item-tax-and-totals';
import { useCartStockGuard } from './use-cart-stock-guard';
import { enqueueOrderMutation } from './order-mutation-queue';
import { ensurePosOrderIdentityMeta, findByProductVariationID } from './utils';
import { useAppState } from '../../../../contexts/app-state';
import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';
import {
	documentRecordId,
	findEngineResident,
	insertEngineResident,
	patchEngineResident,
	useLocalMutation,
} from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrderActions } from '../contexts/current-order';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type FeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];
type ShippingLine = NonNullable<import('@wcpos/database').OrderDocument['shipping_lines']>[number];
type CouponLine = NonNullable<import('@wcpos/database').OrderDocument['coupon_lines']>[number];
type CartLine = LineItem | FeeLine | ShippingLine | CouponLine;
type CartLineType = 'line_items' | 'fee_lines' | 'shipping_lines' | 'coupon_lines';
type EngineResident = NonNullable<Awaited<ReturnType<typeof findEngineResident>>>;

/**
 * The skeleton resident is inserted BEFORE its create is enqueued, so a resident
 * on its own is not proof that the server was ever told about the order. Three
 * signals say it was:
 *
 * - the enqueue marks the record dirty and appends to `local.pendingMutationIds`
 *   (write-intents' dirty-mark) — a create is queued but not yet pushed;
 * - the create ack stamps the server id into `remoteId` (the orders facet's
 *   `remoteIdField`, from the pushed document's `id`) — the server has it;
 * - `sync.revision` only moves for hosts that answer with a
 *   `{ document, currentRevision }` envelope. wc/v3 returns a BARE order, so
 *   `currentRevision` is null and an acked Woo order keeps `revision: ''` for
 *   life — revision alone would read every synced order as an orphan and create
 *   it a second time.
 *
 * With none of them the resident is an orphan from a failed (or interrupted)
 * enqueue, and queueing updates against it would 404 forever.
 */
function hasQueuedOrAcknowledgedCreate(resident: EngineResident): boolean {
	const record = resident as unknown as {
		local?: { dirty?: boolean; pendingMutationIds?: unknown[] };
		sync?: { revision?: unknown };
		remoteId?: unknown;
	};
	if (record.local?.dirty === true) return true;
	if ((record.local?.pendingMutationIds?.length ?? 0) > 0) return true;
	if (record.remoteId !== null && record.remoteId !== undefined) return true;
	return typeof record.sync?.revision === 'string' && record.sync.revision !== '';
}

/**
 * Provides the queued mutation used to add a cart line to the current order.
 *
 * @returns An object containing the callback that adds a line to the order.
 */
export const useAddItemToOrder = () => {
	// Event-time resolution: every product tile mounts this hook via useAddProduct, so a
	// render-time subscription re-rendered the whole grid on every cart write.
	const { getCurrentOrder, setCurrentOrderID } = useCurrentOrderActions();
	const runtime = useQueryRuntime();
	const { localPatch } = useLocalMutation();
	const { stockGuardEnabled, checkCartStock, showBackorderWarning } = useCartStockGuard();
	const { calculateLineItemTaxesAndTotals } = useCalculateLineItemTaxAndTotals();
	const { store, wpCredentials } = useAppState();
	const taxBasedOn = useObservableEagerState(store.tax_based_on$) as string | undefined;
	const identity = React.useMemo(
		() => ({ userId: wpCredentials.id, storeId: store.id, taxBasedOn }),
		[store.id, taxBasedOn, wpCredentials.id]
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
		(existing: CartLine[], type: CartLineType, data: CartLine) => {
			const lineItem = data as LineItem;
			// A miscellaneous product (product_id 0) is always its own line, matching
			// the duplicate check in useAddProduct/useAddVariation.
			if (type !== 'line_items' || !lineItem.product_id) {
				return [...existing, data];
			}
			const matches = findByProductVariationID(
				existing as LineItem[],
				lineItem.product_id,
				lineItem.variation_id ?? 0
			);
			if (!matches || matches.length !== 1) return [...existing, data];
			const match = matches[0];
			const merged = calculateLineItemTaxesAndTotals({
				...match,
				quantity: (match.quantity ?? 0) + (lineItem.quantity ?? 1),
			}) as LineItem;
			return (existing as LineItem[]).map((item) => (item === match ? merged : item));
		},
		[calculateLineItemTaxesAndTotals]
	);

	/**
	 * `orphanedSkeleton` is a resident whose create never reached the write queue;
	 * it is reused (never re-inserted) so the lines it already holds survive the
	 * retry.
	 */
	const saveNewOrder = React.useCallback(
		async (
			order: import('@wcpos/database').OrderDocument,
			type: CartLineType,
			data: CartLine,
			options?: { orphanedSkeleton?: EngineResident | null }
		) => {
			const date_created_gmt = convertLocalDateToUTCString(new Date());

			const recordId = documentRecordId(order);
			if (!recordId) throw new Error('New order is missing its uuid');
			const orphanedSkeleton = options?.orphanedSkeleton ?? null;
			let resident: EngineResident;
			if (orphanedSkeleton) {
				const priorPayload = (orphanedSkeleton.toMutableJSON().payload ?? {}) as Record<
					string,
					unknown
				>;
				resident = await patchEngineResident({
					manager: runtime,
					collection: 'orders',
					recordId,
					changes: {
						[type]: buildCartLines(
							(priorPayload[type] as CartLine[] | undefined) ?? [],
							type,
							data
						),
						meta_data: ensurePosOrderIdentityMeta(
							priorPayload.meta_data as Parameters<typeof ensurePosOrderIdentityMeta>[0],
							identity
						),
					},
				});
			} else {
				const orderData = order.toMutableJSON();
				const orderJSON: Record<string, unknown> = {
					...orderData,
					meta_data: ensurePosOrderIdentityMeta(orderData.meta_data, identity),
					date_created_gmt,
					[type]: [data],
				};
				resident = await insertEngineResident({
					manager: runtime,
					collection: 'orders',
					recordId,
					payload: orderJSON,
				});
			}
			const payload = resident.toMutableJSON().payload as Record<string, unknown>;
			// A guest sale has no email, stored locally as ''. wc/v3 rejects '' with
			// rest_invalid_email (400), which dead-letters the CREATE and strands the
			// order (every later update 404s). Absent means "no email" — same strip as
			// use-push-document's pay path.
			const billing = payload.billing as Record<string, unknown> | undefined;
			if (billing?.email === '') delete billing.email;
			try {
				await runtime.engine.write({
					collection: 'orders',
					operation: 'create',
					recordId,
					payload,
				});
			} catch (error) {
				// The resident is inserted before the create is enqueued. Left behind,
				// it looks to the next add like an order the server already knows about,
				// so that add queues an update which 404s forever. Only roll back the
				// resident inserted here — an orphan reused above keeps its lines for
				// the next retry.
				if (!orphanedSkeleton) {
					try {
						await resident.remove();
					} catch {
						// The create failure is the error worth surfacing.
					}
				}
				throw error;
			}
			const savedOrder = wrapEngineDocument(
				'orders',
				resident as never
			) as unknown as import('@wcpos/database').OrderDocument;
			await order.remove();
			setCurrentOrderID(recordId);
			return savedOrder;
		},
		[buildCartLines, identity, runtime, setCurrentOrderID]
	);

	/**
	 * NOTE: If I don't include getLatest(), the populate() will return old data
	 */
	const addItemToOrder = React.useCallback(
		async (type: CartLineType, data: CartLine) => {
			const order = getCurrentOrder().getLatest();

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
				const temporaryOrder = order.getLatest();
				let latest = context.order?.getLatest() ?? temporaryOrder;
				let isNew = Boolean((latest as unknown as { isNew?: boolean }).isNew);
				let orphanedSkeleton: EngineResident | null = null;
				if (isNew && !context.order) {
					const resident = await findEngineResident(runtime, 'orders', recordId);
					if (resident) {
						latest = wrapEngineDocument(
							'orders',
							resident as never
						) as unknown as import('@wcpos/database').OrderDocument;
						if (hasQueuedOrAcknowledgedCreate(resident)) {
							context.order = latest;
							isNew = false;
						} else {
							// A skeleton whose create never made it to the queue: stay on the
							// create path so it is retried against this resident, instead of
							// patching an order the server has never seen.
							orphanedSkeleton = resident;
						}
					}
				}
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

				let result;
				if (isNew) {
					const savedOrder = await saveNewOrder(temporaryOrder, type, data, {
						orphanedSkeleton,
					});
					context.order = savedOrder;
					result = savedOrder;
				} else {
					result = await localPatch({
						document: latest,
						data: {
							[type]: buildCartLines((latest[type] as CartLine[] | undefined) ?? [], type, data),
						} as never,
					});
				}
				if (stockWarningName !== null) showBackorderWarning(stockWarningName);
				return result;
			});
		},
		[
			buildCartLines,
			checkCartStock,
			getCurrentOrder,
			localPatch,
			runtime,
			saveNewOrder,
			showBackorderWarning,
			stockGuardEnabled,
		]
	);

	return { addItemToOrder };
};
