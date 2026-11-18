import * as React from 'react';

import {
	type EngineRecord,
	MoneyCommandError,
	moneyCommandPoster,
	useQueryRuntime,
} from '@wcpos/query';
import type { OrderPaymentSummary } from '@wcpos/order-math';
import { isDefinitiveMoneyRefusal, moneyRefusalOf } from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { useStoreSession } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { useRestHttpClient } from '../hooks/use-rest-http-client';
import { useStorageMoneyPathGuard } from '../hooks/use-storage-health';

const logger = getLogger(['wcpos', 'orders', 'mark-completed']);

/** Mark completed is Pro only, the order modal's Edit gate (Paul, 18 Nov): its one predicate. */
export function markCompletedTier(isPro: boolean): boolean {
	return isPro;
}

/** The store's refusal reasons (`wcpos_order_not_completable`, Pro `Order_Complete_Controller`). */
function reasonTitle(t: ReturnType<typeof useT>, reason: string | null): string | undefined {
	switch (reason) {
		case 'not_processing':
			return t('orders.mark_completed_not_processing');
		case 'payment_in_motion':
			return t('orders.mark_completed_payment_in_motion');
		case 'not_paid':
			return t('orders.mark_completed_not_paid');
		default:
			return undefined;
	}
}
/** Refused before or by the journal: the store never completed the order. */
const LOCAL_REFUSALS: readonly string[] = [
	'order_changed',
	'revision_unavailable',
	'preflight_failed',
];

/** Orders with a Mark completed awaiting the store: module-wide, as `reopensInFlight` is. */
const completesInFlight = new Set<string>();
const inFlightListeners = new Set<() => void>();
function setInFlight(orderUuid: string, inFlight: boolean) {
	if (inFlight) completesInFlight.add(orderUuid);
	else completesInFlight.delete(orderUuid);
	inFlightListeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
	inFlightListeners.add(listener);
	return () => {
		inFlightListeners.delete(listener);
	};
}

/**
 * Mark a paid processing order completed (monorepo#3648): `POST orders/{id}/complete`, a money
 * command journaled beside `close`, never a record push (the write contract keeps `completed` off
 * the wire). The store runs WooCommerce's own Complete; the answer is mirrored. An answer that
 * never arrives is not a success: the journal re-sends it and the order updates when it lands.
 */
export function useMarkCompleted(order: EngineRecord<'orders'>) {
	const runtime = useQueryRuntime();
	const { storeDB } = useStoreSession();
	const http = useRestHttpClient();
	const t = useT();
	const { blockIfDegraded } = useStorageMoneyPathGuard();
	const key = order.uuid ?? '';
	const completing = React.useSyncExternalStore(subscribe, () => completesInFlight.has(key));

	const reportRefusal = React.useCallback(
		(title: string, text2: string | undefined, reason: string | null) =>
			logger.debug('Mark completed refused', {
				showToast: true,
				toast: { title, ...(text2 ? { text2 } : {}), type: 'error' },
				context: { orderId: order.uuid, reason },
			}),
		[order.uuid]
	);

	const run = React.useCallback(async () => {
		if (blockIfDegraded('save-order', { orderId: order.uuid })) return;
		const id = (order.getLatest?.() ?? order).payload.id;
		if (!id) return;
		const post = moneyCommandPoster({
			runtime,
			storeDB,
			orderUuid: key,
			post: (url, body) => http.post(url, body),
		});
		try {
			// The poster already holds the answer to `isMoneyAnswer('complete')`: `{order}`.
			const { data } = (await post(`orders/${id}/complete`, {})) as {
				data: { order: OrderPaymentSummary; revision?: unknown };
			};
			await post.mirror({ order: data.order, revision: data.revision });
		} catch (error) {
			const refusal = moneyRefusalOf(error);
			if (isDefinitiveMoneyRefusal(refusal)) {
				await post.settle();
				const reason = typeof refusal?.data?.reason === 'string' ? refusal.data.reason : null;
				const title =
					refusal?.code === 'wcpos_order_not_completable' ? reasonTitle(t, reason) : undefined;
				if (title)
					return reportRefusal(title, reason === 'not_paid' ? refusal?.message : undefined, reason);
				return reportRefusal(
					t('pos_checkout.order_refused'),
					refusal?.message ?? refusal?.code,
					reason
				);
			}
			if (error instanceof MoneyCommandError && LOCAL_REFUSALS.includes(error.reason))
				return reportRefusal(t('pos_checkout.order_refused'), error.reason, error.reason);
			logger.debug('Mark completed outcome unknown', {
				showToast: true,
				toast: { title: t('orders.mark_completed_unknown'), type: 'error' },
				context: { orderId: order.uuid, error: getErrorMessage(error) },
			});
		}
	}, [blockIfDegraded, order, key, runtime, storeDB, http, reportRefusal, t]);

	/** One Mark completed per order at a time; a press while one awaits the store is ignored. */
	const markCompleted = React.useCallback(async () => {
		if (completesInFlight.has(key)) return;
		setInFlight(key, true);
		try {
			await run();
		} finally {
			setInFlight(key, false);
		}
	}, [key, run]);

	return { markCompleted, completing };
}
