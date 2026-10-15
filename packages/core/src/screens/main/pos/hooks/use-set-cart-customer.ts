import * as React from 'react';

import { GUEST_CUSTOMER_ID } from '@wcpos/sync-core';

import { enqueueCartAction } from './enqueue-cart-action';
import { useActionContext } from './use-action-context';
import { dispatchAction } from '../../../../extensions/actions';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';

import type { OrderMutationContext } from './order-mutation-queue';
import type { CurrentOrderRecord } from '../contexts/current-order';

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
	const { localPatch } = useLocalMutation();
	const { ctx, actor } = useActionContext();

	return React.useCallback(
		async (order: CurrentOrderRecord, fields: CartCustomerFields) => {
			const run = (target: CurrentOrderRecord, queue: OrderMutationContext) => {
				// Read inside the slot: a stamp queued ahead (the new-customer link bridge) is the
				// customer this write keeps, not the one the form last rendered.
				const current = target.getLatest().payload.customer_id ?? null;
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
					bottom: (e) =>
						localPatch({
							document: target,
							data: {
								...(setsCustomer ? { customer_id: e.payload.customerId } : {}),
								billing: e.payload.billing ?? undefined,
								shipping: e.payload.shipping ?? undefined,
								...(e.payload.taxIds ? { tax_ids: e.payload.taxIds } : {}),
							},
						}),
				});
			};
			return (await enqueueCartAction(order, run, {
				ctx,
				context: { orderId: order.uuid, customerId: fields.customerId ?? null },
			})) as Awaited<ReturnType<typeof localPatch>> | false;
		},
		[localPatch, ctx, actor]
	);
};
