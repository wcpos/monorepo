import * as React from 'react';

import { enqueueOrderMutation } from './order-mutation-queue';
import { useActionContext } from './use-action-context';
import {
	dispatchAction,
	isActionRefusal,
	presentActionRefusal,
} from '../../../../extensions/actions';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';

import type { CurrentOrderRecord } from '../contexts/current-order';

type Plain = Record<string, unknown>;

export interface CartCustomerFields {
	/** The Woo customer id the order now belongs to; the guest id for a walk-in or a born-local customer. */
	customerId: number;
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
			const outcome = await enqueueOrderMutation(order.uuid, (queue) =>
				dispatchAction({
					event: 'cart.customer.set',
					token: queue.dispatchToken,
					ctx,
					input: {
						orderId: order.uuid,
						actor,
						source: 'user',
						payload: {
							customerId: fields.customerId,
							previousCustomerId: order.getLatest().payload.customer_id ?? null,
							// The dispatcher's clone drops `undefined`; the write puts it back as absent.
							billing: fields.billing ?? null,
							shipping: fields.shipping ?? null,
							taxIds: fields.taxIds,
						},
					},
					bottom: (e) =>
						localPatch({
							document: order,
							data: {
								customer_id: e.payload.customerId,
								billing: e.payload.billing ?? undefined,
								shipping: e.payload.shipping ?? undefined,
								...(e.payload.taxIds ? { tax_ids: e.payload.taxIds } : {}),
							},
						}),
				})
			);
			if (isActionRefusal(outcome)) {
				presentActionRefusal(ctx, outcome, { orderId: order.uuid, customerId: fields.customerId });
				return false;
			}
			return outcome as Awaited<ReturnType<typeof localPatch>>;
		},
		[localPatch, ctx, actor]
	);
};
