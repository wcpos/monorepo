import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';

import {
	derive,
	hasSaleProvenance,
	isCompletingStatus,
	isSettledPaymentRow,
	readLedger,
} from '@wcpos/order-math';
import type { OrderPaymentSummary, PaymentRow } from '@wcpos/order-math';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { type EngineRecord, moneyCommandPoster, useQueryRuntime } from '@wcpos/query';
import { readResidentOrder } from '@wcpos/query/record-readers';
import { observeOfflineDeviceAuthorizations } from '@wcpos/query/mutations';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import {
	completeSale,
	completionMetaFor,
	isSaleComplete,
	isSettledOrderStatus,
} from '../../sale-completion';
import { useSaleContext } from '../../hooks/use-sale-context';
import { commandProvenance } from '../../provenance/command-provenance';
import { useStoreSession } from '../../../../../../contexts/app-state';
import {
	getTerminalPaymentsService,
	startTerminalPaymentsService,
	stopTerminalPaymentsService,
} from '../../../../../../services/terminal-payments';
import { useOrderLedgerWrite } from '../../../commands/use-order-ledger-write';
import { useRestHttpClient } from '../../../../hooks/use-rest-http-client';
import { usePaymentMethods } from '../../../../hooks/use-payment-methods';
import {
	getOrderSaveState,
	receiptEntryAfterWrite,
	subscribeCheckoutMode,
} from '../../checkout-mode';

const logger = getLogger(['wcpos', 'pos', 'checkout']);

/**
 * Whether this payment finishes the sale: the settlement's own test (a settled row and
 * `isSaleComplete`, as the service's recordSettlement judges it), plus the status blocklist,
 * so a cancelled or failed order never shows a Paid receipt.
 */
function settlesSale(payment: PaymentRow, order: OrderPaymentSummary | undefined, dp: number) {
	return (
		order !== undefined &&
		isSettledPaymentRow(payment) &&
		isSettledOrderStatus(order.status, null) &&
		isSaleComplete({ source: 'terminal', row: payment, order }, dp)
	);
}

export function useTerminalPaymentsService(): void {
	const { store, site, userDB, storeDB } = useStoreSession();
	const ctx = useSaleContext();
	const actor = ctx.actor;
	const http = useRestHttpClient();
	const manager = useQueryRuntime();
	const { stampCompletion } = useOrderLedgerWrite();
	const { methods } = usePaymentMethods();
	const online = useOnlineStatus().status === 'online-website-available';
	// The service outlives a cashier change — its effect keys on store, site and
	// manager only, so an in-flight leg is never torn down by a re-login — and the
	// action row must name whoever is at the till when the money lands, not
	// whoever started the service. So the actor is read live, like the rest.
	const latest = React.useRef({ stampCompletion, methods, online, actor, ctx });
	React.useLayoutEffect(() => {
		latest.current = { stampCompletion, methods, online, actor, ctx };
	}, [stampCompletion, methods, online, actor, ctx]);
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
		// Read at call time from the latest store document, not the session's snapshot (see
		// use-tender-flow); a plain store without `getLatest` (tests) falls back to itself.
		const dp = () => store.getLatest?.()?.price_num_decimals ?? store.price_num_decimals ?? 2;
		const service = startTerminalPaymentsService({
			dp,
			http: {
				get: (url) => binding.client.get(url),
				post: (url, body) => binding.client.post(url, body),
			},
			commandPoster: (orderUuid, { approval, sessionId }) =>
				moneyCommandPoster({
					runtime: manager,
					storeDB,
					orderUuid,
					post: (url, body) => binding.client.post(url, body),
					// A resumed leg has no press: the poster takes its journaled approval, or freezes
					// the order as it stands.
					approval,
					// A re-completion names the session the leg's gates approved, and only the
					// command that completes the sale mints a counter.
					provenance: async (command) => {
						const resident = await readResidentOrder(manager, orderUuid);
						return resident
							? commandProvenance(latest.current.ctx, resident as never, sessionId, command)
							: null;
					},
				}),
			isOnline: () => latest.current.online,
			resolveOrderId: async (orderUuid) => {
				if (getOrderSaveState(orderUuid)) return null;
				const resident = await readResidentOrder(manager, orderUuid);
				return (resident?.payload as EngineRecord<'orders'>['payload'] | undefined)?.id ?? null;
			},
			// ADR 0040 PR A: an offline authorization is never written locally (device tiles are
			// disabled offline); PR B queues it as a record command.
			patchAndEnqueue: async () => {
				throw new Error('offline_unavailable');
			},
			mirror: async (orderUuid, { payment, order }, poster) => {
				let mirrored = false;
				try {
					const resident = await readResidentOrder(manager, orderUuid);
					if (stopped) return;
					if (!resident) throw new Error('Terminal payment order is not resident');
					// A settling status takes the order off the till and unmounts the tender that used
					// to select its receipt; the service selects it once the write has landed.
					const enterReceiptAfter = settlesSale(payment, order, dp())
						? receiptEntryAfterWrite(orderUuid)
						: null;
					await poster.mirror({
						payment,
						order,
						// A device leg's tip moves the order total.
						...(order && payment.capture_mode === 'device' ? { total: order.total } : {}),
					});
					mirrored = true;
					if (!stopped) enterReceiptAfter?.();
					const payload = (resident.getLatest?.().payload ??
						resident.payload) as EngineRecord<'orders'>['payload'];
					const meta_data = cloneDeep(payload.meta_data ?? []);
					if (order && isCompletingStatus(order.status) && !hasSaleProvenance(meta_data)) {
						const patched = await latest.current.stampCompletion(
							resident,
							await completionMetaFor(latest.current.ctx, meta_data, {})
						);
						if (!patched) throw new Error('provenance_save_failed');
					}
				} catch (error) {
					// The leg preserves a known capture even when its local mirror fails.
					if (!mirrored) throw error;
					logger.error('Checkout failed', {
						code: ERROR_CODES.CHECKOUT_FAILED_CART_SAFE,
						showToast: true,
						context: { error: getErrorMessage(error) },
					});
				}
			},
			getBalance: async (orderUuid) => {
				const resident = await readResidentOrder(manager, orderUuid);
				if (!resident) throw new Error('Terminal payment order is not resident');
				const payload = (resident.getLatest?.().payload ??
					resident.payload) as EngineRecord<'orders'>['payload'];
				return derive(payload.total, readLedger(payload.meta_data), latest.current.methods, {
					dp: dp(),
				}).balance;
			},
			getActor: () => latest.current.actor,
			completeOrder: async (orderUuid, actor, outcome) => {
				const resident = await readResidentOrder(manager, orderUuid);
				if (stopped) return;
				if (!resident) throw new Error('Terminal payment order is not resident');
				await completeSale({ ...latest.current.ctx, actor }, resident, outcome, {
					host: 'background',
				});
			},
		});
		// Offline-paid orders can be completed and absent from open tabs. Recover their
		// locally queued, typed ledgers directly; no remote order-history demand is added.
		const ledgerSubscription = observeOfflineDeviceAuthorizations(manager.engine).subscribe({
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
								dp: dp(),
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
		const unsubscribe = subscribeCheckoutMode(() => {
			void service.flushOffline();
		});
		// A cashier switch moves the till to another scope, where these legs' orders are not
		// resident: the legs stop. Their sent commands re-send through the scope-bound recovery,
		// and the legs resume, when that cashier's scope is active again (no cross-scope replay).
		const offScope = manager.engine.events((event) => {
			if (event.type === 'scope-switched') service.suspendLegs();
		});
		return () => {
			unsubscribe();
			offScope();
			stopped = true;
			ledgerSubscription.unsubscribe();
			if (bindingRef.current === binding) bindingRef.current = null;
			if (getTerminalPaymentsService() === service) stopTerminalPaymentsService();
		};
	}, [store, site, manager, userDB, storeDB]);
}
