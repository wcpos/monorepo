import * as React from 'react';

import { BehaviorSubject, combineLatest, EMPTY, Observable } from 'rxjs';
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';

import { engineCollection, hasQueuedDelete, useQueryRuntime } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import {
	findEngineResident,
	type MutationDocument,
	useLocalMutation,
} from '../../hooks/mutations/use-local-mutation';
import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';
import {
	dispatchAction,
	isActionRefusal,
	presentActionRefusal,
} from '../../../../extensions/actions';
import { getTemporaryOrder } from '../contexts/current-order/temporary-order';
import { enqueueOrderMutation, type OrderMutationContext } from '../hooks/order-mutation-queue';
import { useActionContext } from '../hooks/use-action-context';
import {
	customerLinkChanges,
	type CustomerLinkDeps,
	dropCustomerLink,
	pendingCustomerLinks,
	reconcileCustomerLink,
} from './new-customer-link';

import type { RxDatabase } from 'rxdb';

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
	const { localPatch } = useLocalMutation();
	const { ctx: actionCtx, actor } = useActionContext();
	const { format } = useCustomerNameFormat();
	const t = useT();

	// The journal and the engine events are external stores with no React owner.
	React.useEffect(() => {
		let disposed = false;
		const deps: CustomerLinkDeps = {
			activeScopeId: () => runtime.engine.status().activeScopeId,
			findCustomer: async (uuid) => {
				const resident = await findEngineResident(runtime, 'customers', uuid);
				if (!resident) return null;
				const { remoteId, payload } = resident.toMutableJSON() as {
					remoteId?: unknown;
					payload?: Record<string, unknown>;
				};
				const id = remoteIdOrNull(remoteId) ?? remoteIdOrNull(payload?.id);
				return { remoteId: id === null ? null : Number(id) };
			},
			findOrder: async (uuid) => {
				const document =
					(await getTemporaryOrder(uuid)) ?? (await findEngineResident(runtime, 'orders', uuid));
				if (!document) return null;
				const { payload, local } = document.toMutableJSON() as {
					payload?: Record<string, unknown>;
					local?: { dirty?: boolean };
				};
				return { document, payload: payload ?? {}, dirty: local?.dirty === true };
			},
			// The acknowledged Woo id reaches the order through the same event as any customer
			// set, as a system action: a hook on `cart.customer.set` sees the real id arrive.
			stampCustomer: async (order, customerId, slot) => {
				const document = order.document as MutationDocument;
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
					bottom: () => localPatch({ document, data: { customer_id: customerId } }),
				});
				if (isActionRefusal(outcome)) {
					presentActionRefusal(actionCtx, outcome, { orderId, customerId });
					return false;
				}
				return Boolean(outcome);
			},
			orderHasQueuedDelete: async (uuid) => {
				const database = runtime.engine.active()?.database;
				// Thrown, not guessed: the pass keeps the link and the next pass retries.
				if (!database) throw new Error('No active scope to read the write queue from');
				return hasQueuedDelete(database, 'orders', uuid);
			},
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
		const linkedResidents = combineLatest([
			new Observable<RxDatabase | null>((subscriber) =>
				runtime.engine.db$((database) => subscriber.next(database))
			),
			linkedOrders,
		])
			.pipe(
				switchMap(([database, orderUuids]) => {
					const orders = engineCollection(database, 'orders');
					if (!orders || orderUuids.length === 0) return EMPTY;
					return orders.find({ selector: { uuid: { $in: orderUuids } } }).$.pipe(
						map((documents) =>
							documents
								.map((document) => {
									const { uuid, payload, local } = document.toJSON();
									return `${uuid}:${payload.status}:${payload.customer_id}:${local?.dirty}`;
								})
								.join('|')
						),
						distinctUntilChanged()
					);
				})
			)
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
			if (!('collection' in event)) return;
			// A link whose order was away for a resync waits; the next order the
			// till sends is a cheap moment to look for it again.
			if (event.collection === 'orders' && event.type === 'write-acknowledged') {
				pass();
				return;
			}
			if (event.collection !== 'customers') return;
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
	}, [storeDB, runtime, localPatch, format, t, actionCtx, actor]);

	return null;
}
