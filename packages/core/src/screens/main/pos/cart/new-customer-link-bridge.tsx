import * as React from 'react';

import { BehaviorSubject } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { orderHasQueuedDelete, useQueryRuntime } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import {
	isCollectionEvent,
	observeOrderLinkStates,
	readCustomerRemoteId,
	readOrderLinkState,
} from '@wcpos/query/mutations';
import {
	customerLinkChanges,
	dropCustomerLink,
	pendingCustomerLinks,
} from '@wcpos/query/store-local';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useCustomerLinkStamp } from '../commands/use-customer-link-stamp';
import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';
import {
	dispatchAction,
	isActionRefusal,
	presentActionRefusal,
} from '../../../../extensions/actions';
import { enqueueOrderMutation, type OrderMutationContext } from '../hooks/order-mutation-queue';
import { useActionContext } from '../hooks/use-action-context';
import { type CustomerLinkDeps, reconcileCustomerLink } from './new-customer-link';

const linkLogger = getLogger(['wcpos', 'pos', 'cart', 'customer']);

// One pass at a time across remounts: two passes stamping the same link would
// enqueue the same update twice.
let passes: Promise<void> = Promise.resolve();

/**
 * Stamps a cart-created customer's Woo id onto its order when the create is
 * acknowledged (#1523), and tells the cashier when the store refuses it.
 *
 * Mounted beside the other engine bridges for the whole store session, not in
 * the cart: an offline customer is acknowledged whenever the queue drains,
 * routinely after the cashier has moved to another order or relaunched. A pass
 * runs on mount (acks that landed while nothing was listening), on every
 * journal change (a new link whose customer is already acknowledged), and on
 * every customer write outcome, and on every order ack (an order back from a resync).
 * It also runs when a linked order's status, customer or unsent state changes:
 * the gateway pay page adopts the paid order with no write event, and a held
 * stamp that adoption retired must be sent again.
 */
export function NewCustomerLinkBridge(): null {
	const { storeDB } = useStoreSession();
	const runtime = useQueryRuntime();
	const { stampCustomer } = useCustomerLinkStamp();
	const { ctx: actionCtx, actor } = useActionContext();
	const { format } = useCustomerNameFormat();
	const t = useT();

	// The journal and the engine events are external stores with no React owner.
	React.useEffect(() => {
		let disposed = false;
		const deps: CustomerLinkDeps = {
			activeScopeId: () => runtime.engine.status().activeScopeId,
			findCustomer: (uuid) => readCustomerRemoteId(runtime, uuid),
			findOrder: (uuid) => readOrderLinkState(runtime, uuid),
			// The acknowledged Woo id reaches the order through the same event as any customer
			// set, as a system action: a hook on `cart.customer.set` sees the real id arrive.
			stampCustomer: async (order, customerId, slot) => {
				const orderId = order.uuid;
				const outcome = await dispatchAction({
					event: 'cart.customer.set',
					token: (slot as OrderMutationContext).dispatchToken,
					ctx: actionCtx,
					input: {
						orderId,
						actor,
						source: 'system',
						payload: {
							customerId,
							previousCustomerId: (order.payload.customer_id as number | undefined) ?? null,
							billing: null,
							shipping: null,
							taxIds: null,
						},
					},
					bottom: () => stampCustomer(order, customerId),
				});
				if (isActionRefusal(outcome)) {
					presentActionRefusal(actionCtx, outcome, { orderId, customerId });
					return false;
				}
				return Boolean(outcome);
			},
			// Throws with no active scope: the pass keeps the link and the next pass retries.
			orderHasQueuedDelete: (uuid) => orderHasQueuedDelete(runtime.engine, uuid),
			serializeOrder: (uuid, run) => enqueueOrderMutation(uuid, (slot) => run(slot)),
			drop: (uuid, at) => dropCustomerLink(storeDB, uuid, at),
			now: () => Date.now(),
		};

		/** The orders the journal is waiting on, as the last pass read it. */
		const linkedOrders = new BehaviorSubject<string[]>([]);

		const pass = (rejectedCustomerUuid?: string) => {
			passes = passes.then(async () => {
				const links = await pendingCustomerLinks(storeDB);
				const orderUuids = Object.keys(links).sort();
				if (!disposed && orderUuids.join() !== linkedOrders.value.join()) {
					linkedOrders.next(orderUuids);
				}
				for (const [orderUuid, link] of Object.entries(links)) {
					if (disposed) return;
					try {
						const outcome = await reconcileCustomerLink(deps, orderUuid, link, {
							rejected: link.customerUuid === rejectedCustomerUuid,
						});
						if (outcome === 'rejected') {
							linkLogger.error(t('pos_cart.new_customer_not_saved'), {
								showToast: true,
								code: ERROR_CODES.SYNC_UNEXPECTED,
								toast: {
									title: t('pos_cart.new_customer_not_saved_title', {
										name: format({ billing: link.identity }),
									}),
								},
								context: { orderUUID: orderUuid, customerUUID: link.customerUuid },
							});
						}
					} catch (error) {
						// Left in the journal: the next pass retries it.
						linkLogger.debug('Cart customer link not reconciled', {
							context: { orderUUID: orderUuid, error: getErrorMessage(error) },
						});
					}
				}
			});
			passes = passes.catch((error: unknown) => {
				linkLogger.debug('Could not read cart customer links', {
					context: { error: getErrorMessage(error) },
				});
			});
		};

		const journal = customerLinkChanges(storeDB).subscribe(() => pass());
		const linkedResidents = linkedOrders
			.pipe(switchMap((uuids) => observeOrderLinkStates(runtime.engine, uuids)))
			.subscribe({
				next: () => pass(),
				// The write events and the journal still run passes.
				error: (error: unknown) => {
					linkLogger.debug('Stopped watching cart customer link orders', {
						context: { error: getErrorMessage(error) },
					});
				},
			});
		const unsubscribe = runtime.engine.events((event) => {
			if (event.type === 'scope-switched') {
				pass();
				return;
			}
			// A link whose order was away for a resync waits; the next order the
			// till sends is a cheap moment to look for it again.
			if (isCollectionEvent(event, 'orders') && event.type === 'write-acknowledged') {
				pass();
				return;
			}
			if (!isCollectionEvent(event, 'customers')) return;
			switch (event.type) {
				case 'write-acknowledged':
				case 'write-ack-rematerialized':
					pass();
					break;
				case 'write-rejected':
				case 'write-conflict':
					pass(event.recordId);
					break;
			}
		});
		return () => {
			disposed = true;
			journal.unsubscribe();
			linkedResidents.unsubscribe();
			unsubscribe();
		};
	}, [storeDB, runtime, stampCustomer, format, t, actionCtx, actor]);

	return null;
}
