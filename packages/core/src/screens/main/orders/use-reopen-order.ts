import * as React from 'react';

import { useRouter } from 'expo-router';

import { readLedger } from '@wcpos/order-math';
import {
	awaitTerminalWriteOutcome,
	awaitWriteSettlement,
	type EngineRecord,
	useQueryRuntime,
	WriteOutcomeError,
} from '@wcpos/query';
import { MONEY_ANSWER_CODES, NO_STORE, POS_META_KEYS, wooMetaCarrier } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { useRegister } from '../../../services/register/use-register';
import { useStoreSession } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { useOrderRecord } from './commands/use-order-record';
import { useStorageMoneyPathGuard } from '../hooks/use-storage-health';

const logger = getLogger(['wcpos', 'orders', 'reopen']);

/** Where the order's existing Cancel payment action lives. */
const CHECKOUT_ROUTE = '/(app)/(drawer)/(pos)/(modals)/cart/[orderId]/checkout';

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
	const { store, wpCredentials, site } = useStoreSession();
	const register = useRegister();
	const { blockIfDegraded } = useStorageMoneyPathGuard();

	/**
	 * ADR 0040: the server refuses a reopen while a payment leg is in motion, and names the leg.
	 * The engine's push.rejected row records it; the cashier is owed the toast, naming the leg and
	 * pointing at the order's Cancel payment. Online and late (queued offline) refusals land here.
	 */
	const reportRefusal = React.useCallback(
		(error: unknown) => {
			if (!(error instanceof WriteOutcomeError)) return;
			const paymentId = error.data?.payment_id;
			const payload = order.getLatest?.().payload ?? order.payload;
			const row = readLedger(payload.meta_data).find(({ id }) => id === paymentId);
			const method =
				row?.method_id === payload.payment_method ? payload.payment_method_title : row?.method_id;
			const leg = row
				? t('orders.reopen_money_in_motion', { method, amount: legAmount(row) })
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
									onClick: () =>
										router.push({ pathname: CHECKOUT_ROUTE, params: { orderId: order.uuid! } }),
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
		const reopened = await reopenOrder(order, { status: 'pos-open', meta_data });
		if (!reopened) return;
		const { mutationId } = reopened;
		if (mutationId) {
			// The server's answer decides: a refused reopen never lands the cashier in a cart.
			const outcome = await awaitWriteSettlement(runtime.engine, mutationId).catch(
				(error: unknown) => error
			);
			if (outcome instanceof WriteOutcomeError) return reportRefusal(outcome);
			// Offline (or the drain kick failed) the reopen stays queued, as before; its verdict
			// is reported when it drains, through the same report.
			if (outcome !== 'success' && outcome !== 'success-local')
				void awaitTerminalWriteOutcome(runtime.engine, mutationId).catch(reportRefusal);
		}
		if (blockIfDegraded('save-order', { orderId: order.uuid })) return;
		router.push({
			pathname: '/cart/[...orderId]',
			params: { orderId: order.uuid ? [order.uuid] : [] },
		});
	}, [
		blockIfDegraded,
		reopenOrder,
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
