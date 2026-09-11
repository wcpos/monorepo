import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';

import {
	derive,
	hasSaleProvenance,
	isCompletingStatus,
	readLedger,
	upsertPaymentRow,
	withLedger,
} from '@wcpos/order-math';
import type { MetaDataEntry } from '@wcpos/order-math';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { engineCollection, type EngineRecord, useQueryRuntime } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { completionMeta } from '../../provenance/stamp-completion';
import { useStoreSession } from '../../../../../../contexts/app-state';
import {
	getTerminalPaymentsService,
	startTerminalPaymentsService,
	stopTerminalPaymentsService,
} from '../../../../../../services/terminal-payments';
import {
	findEngineResident,
	patchEngineResident,
	useLocalMutation,
} from '../../../../hooks/mutations/use-local-mutation';
import { useRestHttpClient } from '../../../../hooks/use-rest-http-client';
import { usePaymentMethods } from '../../../../hooks/use-payment-methods';
import { enterReceipt, getOrderSaveState, subscribeCheckoutMode } from '../../checkout-mode';
import { reconcileCompletedOrder } from '../../hooks/reconcile-completed-order';

const logger = getLogger(['wcpos', 'pos', 'checkout']);

export function useTerminalPaymentsService(): void {
	const { store, site, userDB } = useStoreSession();
	const http = useRestHttpClient();
	const manager = useQueryRuntime();
	const { localPatch } = useLocalMutation();
	const { methods } = usePaymentMethods();
	const online = useOnlineStatus().status === 'online-website-available';
	const latest = React.useRef({ localPatch, methods, online });
	React.useLayoutEffect(() => {
		latest.current = { localPatch, methods, online };
	}, [localPatch, methods, online]);
	// Connectivity changes are external events; they resume deferred settlements.
	React.useEffect(() => {
		if (online) void getTerminalPaymentsService()?.flushOffline();
	}, [online]);
	const latestHttp = React.useRef(http);
	const bindingRef = React.useRef<{
		store: typeof store;
		site: typeof site;
		client: typeof http;
	} | null>(null);
	// Refresh credentials without restarting legs or binding an old store to a new client's routes.
	React.useLayoutEffect(() => {
		latestHttp.current = http;
		const binding = bindingRef.current;
		if (binding?.store === store && binding.site === site) binding.client = http;
	}, [http, store, site]);
	// The singleton belongs to the external store session, not whichever order is visible.
	React.useEffect(() => {
		const binding = { store, site, client: latestHttp.current };
		bindingRef.current = binding;
		let stopped = false;
		const service = startTerminalPaymentsService({
			http: {
				get: (url) => binding.client.get(url),
				post: (url, body) => binding.client.post(url, body),
			},
			isOnline: () => latest.current.online,
			resolveOrderId: async (orderUuid) => {
				if (getOrderSaveState(orderUuid)) return null;
				const resident = await findEngineResident(manager, 'orders', orderUuid);
				return (resident?.payload as EngineRecord<'orders'>['payload'] | undefined)?.id ?? null;
			},
			patchAndEnqueue: async (orderUuid, payment) => {
				const resident = await findEngineResident(manager, 'orders', orderUuid);
				if (stopped || !resident) throw new Error('Offline payment order is not resident');
				const payload = (resident.getLatest?.().payload ??
					resident.payload) as EngineRecord<'orders'>['payload'];
				const meta = cloneDeep(payload.meta_data ?? []);
				const rows = upsertPaymentRow(readLedger(meta), payment);
				const summary = derive(payload.total, rows, latest.current.methods, {
					dp: store.price_num_decimals ?? 2,
				});
				const meta_data = withLedger(meta, rows);
				const written = await latest.current.localPatch({
					document: resident,
					data: {
						meta_data: isCompletingStatus(summary.status)
							? await completionMeta({ meta_data }, { userDB, siteUuid: site.uuid! })
							: meta_data,
						status: summary.status,
					},
				});
				if (!written) throw new Error('Offline payment could not be saved');
				return {
					...summary,
					total: String(payload.total ?? '0'),
					payment_method: summary.payment_method ?? '',
				};
			},
			mirror: async (orderUuid, { payment, order }) => {
				let mirrored = false;
				try {
					const resident = await findEngineResident(manager, 'orders', orderUuid);
					if (stopped) return;
					if (!resident) throw new Error('Terminal payment order is not resident');
					const payload = (resident.getLatest?.().payload ??
						resident.payload) as EngineRecord<'orders'>['payload'];
					const meta = cloneDeep((payload as { meta_data?: MetaDataEntry[] }).meta_data ?? []);
					const meta_data = withLedger(meta, upsertPaymentRow(readLedger(meta), payment));
					await patchEngineResident({
						manager,
						collection: 'orders',
						recordId: orderUuid,
						// Only the summary fields that are order fields: `paid` and `balance` are
						// derived from the ledger on read, and an unknown key fails the schema.
						changes: {
							...(order
								? {
										status: order.status,
										...(payment.capture_mode === 'device' ? { total: order.total } : {}),
										payment_method: order.payment_method,
										payment_method_title: order.payment_method_title,
									}
								: {}),
							meta_data,
						},
					});
					mirrored = true;
					if (order && isCompletingStatus(order.status) && !hasSaleProvenance(meta)) {
						const patched = await latest.current.localPatch({
							document: resident,
							data: {
								meta_data: await completionMeta({ meta_data }, { userDB, siteUuid: site.uuid! }),
							},
						});
						if (!patched) throw new Error('provenance_save_failed');
					}
				} catch (error) {
					// Ledger failures must reach the leg so it resumes polling instead of finalising.
					if (!mirrored) throw error;
					logger.error('Checkout failed', {
						code: ERROR_CODES.CHECKOUT_FAILED_CART_SAFE,
						showToast: true,
						context: { error: getErrorMessage(error) },
					});
				}
			},
			onCaptured: (orderUuid, order) => {
				// Never select: the order the cashier is serving stays on screen. When
				// the captured order IS the current one, the tender flow's own outcome
				// handler runs the complete-order flow, which selects the receipt.
				if (!stopped && order && Number(order.balance) === 0) {
					enterReceipt(orderUuid, { select: false });
					void findEngineResident(manager, 'orders', orderUuid)
						.then((resident) => {
							if (!stopped && resident)
								return reconcileCompletedOrder(
									manager,
									resident as unknown as EngineRecord<'orders'>
								);
						})
						.catch((error) => {
							logger.warn('Background post-payment reconciliation failed', {
								context: { orderId: orderUuid, error: getErrorMessage(error) },
							});
						});
				}
			},
		});
		// Offline-paid orders can be completed and absent from open tabs. Recover their
		// locally queued, typed ledgers directly; no remote order-history demand is added.
		let ledgerSubscription: { unsubscribe(): void } | undefined;
		const stopWatching = manager.engine.db$((database) => {
			ledgerSubscription?.unsubscribe();
			const collection = engineCollection(database, 'orders');
			if (stopped || !collection) return;
			ledgerSubscription = collection
				.find({
					selector: {
						'payload.meta_data': {
							$elemMatch: {
								key: '_wcpos_payments',
								'value.payments': {
									$elemMatch: {
										capture_mode: 'device',
										recorded_offline: true,
										status: 'authorized',
									},
								},
							},
						},
					},
				})
				.$.subscribe({
					next: (documents) => {
						if (stopped) return;
						for (const document of documents)
							for (const row of readLedger(document.payload.meta_data)) {
								if (
									row.capture_mode === 'device' &&
									row.recorded_offline &&
									row.status === 'authorized'
								)
									service.trackOffline({
										orderUuid: document.uuid,
										orderId: document.payload.id ?? 0,
										orderNumber: document.payload.number ?? '',
										row,
									});
							}
						void service.flushOffline();
					},
					error: (error) => {
						getLogger(['wcpos', 'payments']).error('Offline reader settlement recovery failed', {
							code: ERROR_CODES.PAYMENT_UNEXPECTED,
							context: { error: String(error) },
						});
					},
				});
		});
		const unsubscribe = subscribeCheckoutMode(() => {
			void service.flushOffline();
		});
		return () => {
			unsubscribe();
			stopped = true;
			stopWatching();
			ledgerSubscription?.unsubscribe();
			if (bindingRef.current === binding) bindingRef.current = null;
			if (getTerminalPaymentsService() === service) stopTerminalPaymentsService();
		};
	}, [store, site, manager, userDB]);
}
