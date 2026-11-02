import * as React from 'react';

import { type EngineRecord } from '@wcpos/query';
import { type CategoryLogger, getErrorMessage } from '@wcpos/utils/logger';

import { awaitsStoredStatus } from '../sale-completion';
import { judgeGatewaySnapshot } from './gateway-snapshot';

import type { useSettleGatewaySnapshot } from './use-settle-gateway-snapshot';
import type { useRestHttpClient } from '../../../hooks/use-rest-http-client';

// A pre-hardening store or an async gateway can report "not paid yet" while the
// provider's confirmation is still in flight. Re-read server truth on a short
// cadence — a webhook round-trip is seconds — but stop after a bound: past it the
// cart legitimately stays open for the cashier to decide, and the background
// order lanes (plus the Orders grid's per-order Sync) remain the long-tail net.
// Without the re-poll, a one-shot "still unpaid" answer left the paid order
// stuck as an open cart once the webhook landed a minute later.
const ASYNC_PAYMENT_POLL_INTERVAL_MS = 3_000;
const ASYNC_PAYMENT_POLL_WINDOW_MS = 120_000;
// After a later document loads, the received page's postMessage normally arrives first and
// the message branch's `stop()` cancels this pending start; the read is for pages that never post.
const LATER_DOCUMENT_GRACE_MS = 1_000;

type Settler = ReturnType<typeof useSettleGatewaySnapshot>;

interface ServerTruthPollInput {
	/** Handed in so the poll's suite needs no module mocks. */
	http: ReturnType<typeof useRestHttpClient>;
	order: EngineRecord<'orders'>;
	orderId: number | undefined;
	/** Read through a ref: a re-armed tick must see a gateway catalog that arrived after the start. */
	settledRef: React.RefObject<Record<string, string | null>>;
	dp: number;
	settle: Settler['settle'];
	isSettled: Settler['isSettled'];
	setLoading: (loading: boolean) => void;
	logger: CategoryLogger;
}

/**
 * The server-truth poll: the safety net for a pay page that never posts its completion.
 * `poll()` reads now without touching a pending start; `pollAfterGrace()` replaces any
 * pending start with one a second away. Either way it keeps re-reading on the async cadence
 * until the sale settles or the window, which starts at the first read, passes. There is one
 * timer, so a re-arm replaces whatever tick was pending. `stop()` disarms it; unmounting does too.
 */
export function useServerTruthPoll(input: ServerTruthPollInput) {
	const { http, order, orderId, settledRef, dp, settle, isSettled, setLoading, logger } = input;
	const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	// Set on unmount so a poll still awaiting a response cannot settle the sale, or arm
	// another poll, after checkout closed.
	const unmountedRef = React.useRef(false);

	const stop = React.useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = null;
	}, []);

	/**
	 * Read server truth once, then keep re-reading on the async cadence until the order is
	 * paid or `pollUntilMs` passes. Every not-yet-paid outcome — server unchanged, an unpaid
	 * transition, a transient request failure — re-arms; only a completed sale (here or via
	 * postMessage) settles it.
	 */
	const read = React.useCallback(
		async (pollUntilMs: number): Promise<void> => {
			if (isSettled() || unmountedRef.current) return;
			const localPayload = order.getLatest().payload;
			const localStatus = localPayload.status;
			// The poll reconciles an open cart. The one other local state worth a
			// read is the gateway's stored status having already arrived through
			// background sync — the order is settled, but nothing has routed the
			// cashier off the pay window; the server read below closes it. Exactly
			// that status, for exactly that gateway: any other local status is a
			// sale this screen no longer owns (a partial tender, a sale settled by
			// someone else).
			const local = judgeGatewaySnapshot(localPayload, settledRef.current, dp);
			const localStored = local.storedStatus;
			const localAlreadySettled =
				typeof localStatus === 'string' &&
				localStored !== null &&
				localStatus === localStored &&
				local.complete;
			// Sync can land the stored status locally before the gateway catalog has
			// loaded, so nothing yet says it is settled. Returning here would skip the
			// re-arm in `finally`, and the catalog arriving later would find no poll
			// to close the pay window. Keep polling, bounded, while a payable local
			// status has no stored status to be judged against (the catalog has not
			// loaded, or stores none for this gateway); a later tick judges it.
			const localAwaitingCatalog =
				localStored === null && typeof localStatus === 'string' && awaitsStoredStatus(localStatus);
			if (
				!localStatus ||
				(localStatus !== 'pos-open' && !localAlreadySettled && !localAwaitingCatalog)
			) {
				return;
			}
			try {
				logger.debug('No postMessage received, checking server order status', {
					context: { orderId },
				});
				// The decision reads SERVER truth directly (the sync surface's
				// include-read) — an engine require's `ready` can settle without
				// applying a newer revision to THIS document (skip-coalesced
				// resident tasks, dirty-row protection), so it cannot prove
				// payment state. The snapshot adoption in `settle` is the local
				// write; the engine refresh inside it is catch-up only.
				const response = await http.get('orders', {
					params: { include: orderId, per_page: 1 },
				});
				const serverOrder = response?.data?.[0] as Record<string, unknown> | undefined;
				if (!serverOrder || isSettled() || unmountedRef.current) return;
				const serverStatus = serverOrder.status as string;
				// Unchanged from the open cart: nothing to reconcile. (When the local
				// copy already carries the settled status, "unchanged" IS the outcome.)
				if (serverStatus === localStatus && !localAlreadySettled) return;
				// A status change is not a payment: an unpaid transition leaves everything in
				// place (the finally releases the spinner) so the cashier can retry from the
				// cart they still have — unless it is the status the merchant configured the
				// gateway to settle on, which is the sale finishing.
				const server = judgeGatewaySnapshot(serverOrder, settledRef.current, dp);
				if (!server.complete) {
					logger.debug('Server order status changed but is not paid; leaving the cart open', {
						context: {
							serverStatus,
							settledOrderStatus: server.storedStatus,
							source: 'fallback-refresh',
						},
					});
					return;
				}
				await settle(server, 'fallback-refresh');
			} catch (err) {
				// Best-effort safety net only. Order completion is authoritatively
				// delivered via the postMessage path, so a failed or premature poll
				// (order not queryable yet or a transient sync error) is
				// expected and must NOT be surfaced as a payment-gateway failure —
				// doing so produced spurious PY02001 errors on successful checkouts.
				logger.debug('Fallback order status refresh did not complete', {
					context: {
						error: getErrorMessage(err),
						source: 'fallback-refresh',
					},
				});
			} finally {
				setLoading(false);
				if (!isSettled() && !unmountedRef.current && Date.now() < pollUntilMs) {
					stop();
					timerRef.current = setTimeout(
						() => void read(pollUntilMs),
						ASYNC_PAYMENT_POLL_INTERVAL_MS
					);
				}
			}
		},
		[http, order, orderId, settledRef, dp, settle, isSettled, setLoading, logger, stop]
	);

	const poll = React.useCallback(
		() => void read(Date.now() + ASYNC_PAYMENT_POLL_WINDOW_MS),
		[read]
	);
	const pollAfterGrace = React.useCallback(() => {
		stop();
		timerRef.current = setTimeout(poll, LATER_DOCUMENT_GRACE_MS);
	}, [poll, stop]);

	// A layout effect: its cleanup runs in the commit that removes the frame, so a
	// poll response arriving before the passive cleanups flush already sees the flag.
	React.useLayoutEffect(() => {
		unmountedRef.current = false;
		return () => {
			unmountedRef.current = true;
			stop();
		};
	}, [stop]);

	return { poll, pollAfterGrace, stop };
}
