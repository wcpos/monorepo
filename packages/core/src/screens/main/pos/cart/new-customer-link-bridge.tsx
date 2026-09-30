import * as React from 'react';

import { useQueryRuntime } from '@wcpos/query';
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
import { getTemporaryOrder } from '../contexts/current-order/temporary-order';
import { enqueueOrderMutation } from '../hooks/order-mutation-queue';
import {
	customerLinkChanges,
	type CustomerLinkDeps,
	dropCustomerLink,
	pendingCustomerLinks,
	reconcileCustomerLink,
} from './new-customer-link';

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
 * every customer write outcome.
 */
export function NewCustomerLinkBridge(): null {
	const { storeDB } = useStoreSession();
	const runtime = useQueryRuntime();
	const { localPatch } = useLocalMutation();
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
				const { payload } = document.toMutableJSON() as { payload?: Record<string, unknown> };
				return { document, payload: payload ?? {} };
			},
			stampCustomer: async (document, customerId) =>
				Boolean(
					await localPatch({
						document: document as MutationDocument,
						data: { customer_id: customerId },
					})
				),
			serializeOrder: (uuid, run) => enqueueOrderMutation(uuid, () => run()),
			drop: (uuid, at) => dropCustomerLink(storeDB, uuid, at),
		};

		const pass = (rejectedCustomerUuid?: string) => {
			passes = passes.then(async () => {
				const links = await pendingCustomerLinks(storeDB);
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
		const unsubscribe = runtime.engine.events((event) => {
			if (event.type === 'scope-switched') {
				pass();
				return;
			}
			if (!('collection' in event) || event.collection !== 'customers') return;
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
			unsubscribe();
		};
	}, [storeDB, runtime, localPatch, format, t]);

	return null;
}
