import * as React from 'react';

import { useRouter } from 'expo-router';

import { readAwaitingCustomer, readLedger } from '@wcpos/order-math';
import {
	awaitTerminalWriteOutcome,
	awaitWriteSettlement,
	type EngineRecord,
	useQueryRuntime,
	WriteOutcomeError,
} from '@wcpos/query';
import { MONEY_ANSWER_CODES, NO_STORE, POS_META_KEYS, wooMetaCarrier } from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { useRegister } from '../../../services/register/use-register';
import { useStoreSession } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { useOrderRecord, useUndoRefusedReopen } from './commands/use-order-record';
import { useStorageMoneyPathGuard } from '../hooks/use-storage-health';
import { standaloneCheckoutHref } from '../pos/checkout/till-route';

const logger = getLogger(['wcpos', 'orders', 'reopen']);

/**
 * Orders with a reopen awaiting the store's verdict. Module-wide, so every surface that can
 * reopen the order (the order menu, the invoice's Send again) sees one reopen in flight: a
 * second press would find the resident already `pos-open`, queue nothing, and walk into the
 * cart before the first one's refusal arrives.
 */
const reopensInFlight = new Set<string>();
const inFlightListeners = new Set<() => void>();
function setReopenInFlight(orderUuid: string, inFlight: boolean) {
	if (inFlight) reopensInFlight.add(orderUuid);
	else reopensInFlight.delete(orderUuid);
	inFlightListeners.forEach((listener) => listener());
}
function subscribeReopensInFlight(listener: () => void) {
	inFlightListeners.add(listener);
	return () => {
		inFlightListeners.delete(listener);
	};
}

/** A leg's amount in the leg's own currency; the bare amount when Intl does not know it. */
function legAmount(row: { amount: string; currency: string }): string {
	try {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency: row.currency }).format(
			Number(row.amount)
		);
	} catch {
		return row.amount;
	}
}

/**
 * Re-open an order at this till: status back to pos-open, cashier and store stamped on it,
 * then the cart once the store accepts it (or, offline, once it is queued). #163 ruling R5: with the worker dead that write cannot be recorded, and the
 * cart it lands in could not be checked out anyway, so a degraded store refuses at the door.
 * `reopening` is true while a reopen of this order awaits the store; callers disable on it.
 */
export function useReopenOrder(order: EngineRecord<'orders'>) {
	const router = useRouter();
	const runtime = useQueryRuntime();
	const t = useT();
	const { reopenOrder } = useOrderRecord();
	const undoRefusedReopen = useUndoRefusedReopen();
	const { store, wpCredentials, site } = useStoreSession();
	const register = useRegister();
	const { blockIfDegraded } = useStorageMoneyPathGuard();

	/**
	 * ADR 0040: the server refuses a reopen while a payment leg is in motion, and names the leg.
	 * The engine's push.rejected row records it; the cashier is owed the toast, naming the leg and
	 * pointing at the order's Cancel payment. Online and late (queued offline) refusals land here.
	 */
	const reportRefusal = React.useCallback(
		(error: WriteOutcomeError) => {
			// The refusal names the work in motion by its ledger row or by its gateway attempt.
			const paymentId = error.data?.payment_id;
			const attemptId = error.data?.attempt_id;
			const payload = order.getLatest?.().payload ?? order.payload;
			const methodName = (methodId: string) =>
				methodId === payload.payment_method ? payload.payment_method_title : methodId;
			const row =
				paymentId === undefined
					? undefined
					: readLedger(payload.meta_data).find(({ id }) => id === paymentId);
			const stamp = readAwaitingCustomer(payload.meta_data);
			const attempt =
				attemptId !== undefined && stamp?.attempt_id === attemptId ? stamp : undefined;
			const leg = row
				? t('orders.reopen_money_in_motion', {
						method: methodName(row.method_id),
						amount: legAmount(row),
					})
				: attempt
					? t('orders.reopen_money_in_motion_attempt', { method: methodName(attempt.method_id) })
					: t('orders.reopen_money_in_motion_unknown');
			logger.debug('Reopen refused', {
				showToast: true,
				toast:
					error.reason === MONEY_ANSWER_CODES.moneyInMotion
						? {
								title: error.serverMessage ?? leg,
								type: 'error',
								action: {
									label: t('pos_checkout.cancel_payment'),
									// The order's own checkout, where its Cancel payment lives: standalone,
									// because after the undo the order is not an open cart.
									onClick: () => router.push(standaloneCheckoutHref(order.uuid!)),
								},
							}
						: {
								title: t('pos_checkout.order_refused'),
								text2:
									error.serverMessage ?? error.reason ?? t('pos_checkout.order_refused_no_reason'),
								type: 'error',
								action: {
									label: t('pos_checkout.open_store_health'),
									onClick: () => router.push('/health/database'),
								},
							},
				context: {
					orderId: order.uuid,
					reason: error.reason ?? null,
					paymentId: paymentId ?? null,
					attemptId: attemptId ?? null,
				},
			});
		},
		[order, router, t]
	);

	const inFlightKey = order.uuid ?? '';
	const reopening = React.useSyncExternalStore(subscribeReopensInFlight, () =>
		reopensInFlight.has(inFlightKey)
	);

	const run = React.useCallback(async () => {
		if (blockIfDegraded('save-order', { orderId: order.uuid })) return;
		const existingMeta = order.payload.meta_data ?? [];
		const existingStoreId = wooMetaCarrier.readIdentity(existingMeta).storeId;
		let meta_data = wooMetaCarrier.stampIdentity(existingMeta, {
			userId: wpCredentials.id!,
			tillId: register?.id,
			registerId: register?.sites[site.uuid!]?.register_id ?? undefined,
			storeId: store.id === NO_STORE ? (existingStoreId ?? NO_STORE) : store.id!,
		});
		if (store.id === NO_STORE && existingStoreId === null) {
			meta_data = meta_data.filter((entry) => entry.key !== POS_META_KEYS.store);
		}
		const previousStatus = order.payload.status;
		const reopened = await reopenOrder(order, { status: 'pos-open', meta_data });
		if (!reopened) return;
		const { mutationId } = reopened;
		/**
		 * The store refused the reopen: say why, then undo the optimistic pos-open. Status is an
		 * intent and the refusal is the store's word; a pos-open left behind would get every later
		 * write on the order refused too. Online and late (queued offline) refusals alike: a late
		 * one takes the order out of the open cart, as another till closing it would, and the
		 * toast says why the cart changed.
		 */
		const refused = async (error: WriteOutcomeError) => {
			reportRefusal(error);
			await undoRefusedReopen(order, previousStatus).catch((failure: unknown) =>
				logger.debug('Could not undo the refused reopen locally', {
					context: { orderId: order.uuid, error: getErrorMessage(failure) },
				})
			);
		};
		if (mutationId) {
			// The server's answer decides: a refused reopen never lands the cashier in a cart.
			const outcome = await awaitWriteSettlement(runtime.engine, mutationId).catch(
				(error: unknown) => error
			);
			// Undone before the action frees up.
			if (outcome instanceof WriteOutcomeError) return refused(outcome);
			// Offline (or the drain kick failed) the reopen stays queued, as before; its verdict
			// is handled when it drains, the same way.
			if (outcome !== 'success' && outcome !== 'success-local')
				void awaitTerminalWriteOutcome(runtime.engine, mutationId).catch((error: unknown) =>
					error instanceof WriteOutcomeError ? refused(error) : undefined
				);
		}
		if (blockIfDegraded('save-order', { orderId: order.uuid })) return;
		router.push({
			pathname: '/cart/[...orderId]',
			params: { orderId: order.uuid ? [order.uuid] : [] },
		});
	}, [
		blockIfDegraded,
		reopenOrder,
		undoRefusedReopen,
		reportRefusal,
		runtime,
		router,
		order,
		store.id,
		wpCredentials.id,
		register,
		site.uuid,
	]);

	/** One reopen per order at a time; a call while one awaits the store is ignored. */
	const reopen = React.useCallback(async () => {
		if (reopensInFlight.has(inFlightKey)) return;
		setReopenInFlight(inFlightKey, true);
		try {
			await run();
		} finally {
			setReopenInFlight(inFlightKey, false);
		}
	}, [inFlightKey, run]);

	return { reopen, reopening };
}
