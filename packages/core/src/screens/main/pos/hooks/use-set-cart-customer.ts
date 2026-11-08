import * as React from 'react';

import { isActiveLineItem } from '@wcpos/order-math';
import { useQueryRuntime } from '@wcpos/query';
import { GUEST_CUSTOMER_ID, POS_META_KEYS } from '@wcpos/sync-core';
import type { EngineWarning } from '@wcpos/order-math';

import { enqueueCartAction } from './enqueue-cart-action';
import { useActionContext } from './use-action-context';
import { useCartConfigReader } from './use-cart-config';
import { readCatalogTaxStatuses } from './use-coupon-context';
import { dispatchAction } from '../../../../extensions/actions';
import { retaxForCustomerWrite } from '../commands/retax-for-customer-write';
import { useCartWrite } from '../commands/use-cart-write';
import { useReportEngineWarnings } from '../contexts/order-engine-warnings';
import { useServerOwnsMoneyReader } from '../contexts/order-money-divergence';

import type { OrderMutationContext } from './order-mutation-queue';
import type { CurrentOrderRecord } from '../contexts/current-order';
import type { OrderPayload } from '../commands/cart-config-for-order';

type Plain = Record<string, unknown>;

export interface CartCustomerFields {
	/**
	 * The Woo customer id the order now belongs to; the guest id for a walk-in or a born-local
	 * customer. Absent, the order keeps whoever it is for (an address edit, or a picked customer
	 * whose create is not yet acknowledged and so has no id): the field is not written, and the
	 * event carries the id the order has as its queue slot starts.
	 */
	customerId?: number;
	/** An absent address is written as absent, as the forms always did. */
	billing: Plain | undefined;
	shipping: Plain | undefined;
	/** The order's own snapshot of the customer's tax ids; `null` leaves the current snapshot alone. */
	taxIds: Plain[] | null;
}

/**
 * The one writer for who the order is for: the customer id and the addresses the order carries
 * (and its tax-id snapshot), patched together inside the order's mutation queue after the
 * `cart.customer.set` hooks have seen, rewritten or refused them.
 */
export const useSetCartCustomer = () => {
	const { localPatch } = useCartWrite();
	const { ctx, actor } = useActionContext();
	const configForOrder = useCartConfigReader();
	const serverOwnsMoney = useServerOwnsMoneyReader();
	const reportEngineWarnings = useReportEngineWarnings();
	const runtime = useQueryRuntime();

	return React.useCallback(
		async (order: CurrentOrderRecord, fields: CartCustomerFields) => {
			const run = async (target: CurrentOrderRecord, queue: OrderMutationContext) => {
				// Read inside the slot: a stamp queued ahead (the new-customer link bridge) is the
				// customer this write keeps, not the one the form last rendered.
				const current = target.getLatest().payload.customer_id ?? null;
				// In the slot, so no later action overtakes this write while the catalog is read.
				const taxStatusFor = await readCatalogTaxStatuses(
					runtime.engine,
					(target.getLatest().payload.line_items ?? []).filter(
						(line) =>
							isActiveLineItem(line) &&
							!line.meta_data?.some(({ key }) => key === POS_META_KEYS.posData)
					)
				);
				const setsCustomer = fields.customerId !== undefined;
				return dispatchAction({
					event: 'cart.customer.set',
					token: queue.dispatchToken,
					ctx,
					input: {
						orderId: target.uuid,
						actor,
						source: 'user',
						payload: {
							customerId: setsCustomer ? fields.customerId! : (current ?? GUEST_CUSTOMER_ID),
							previousCustomerId: current,
							// The dispatcher's clone drops `undefined`; the write puts it back as absent.
							billing: fields.billing ?? null,
							shipping: fields.shipping ?? null,
							taxIds: fields.taxIds,
						},
					},
					bottom: async (e) => {
						const intent = {
							...(setsCustomer ? { customer_id: e.payload.customerId } : {}),
							billing: e.payload.billing ?? undefined,
							shipping: e.payload.shipping ?? undefined,
							...(e.payload.taxIds ? { tax_ids: e.payload.taxIds } : {}),
						};
						let warnings: readonly EngineWarning[] = [];
						const data = (currentPayload: OrderPayload) => {
							warnings = [];
							const retaxed = retaxForCustomerWrite(currentPayload, intent, {
								configForOrder,
								ownedElsewhere: serverOwnsMoney(target.uuid),
								taxStatusFor,
							});
							warnings = retaxed.warnings;
							return { ...intent, ...retaxed.lines };
						};
						const result = await localPatch({ queue, document: target, data });
						reportEngineWarnings(warnings, { orderId: target.uuid, site: 'useSetCartCustomer' });
						return result;
					},
				});
			};
			return (await enqueueCartAction(order, run, {
				ctx,
				context: { orderId: order.uuid, customerId: fields.customerId ?? null },
			})) as Awaited<ReturnType<typeof localPatch>> | false;
		},
		[localPatch, ctx, actor, configForOrder, serverOwnsMoney, reportEngineWarnings, runtime]
	);
};
