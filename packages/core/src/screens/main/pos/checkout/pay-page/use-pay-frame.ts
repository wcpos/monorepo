import * as React from 'react';

import type { CategoryLogger } from '@wcpos/utils/logger';

import type { PaymentFrameStatus } from './use-pay-frame-gate';

// How long the checkout waits for the store's order-pay document before it
// treats the navigation as stalled and reloads the frame once.
//
// The document is one WordPress page. A healthy store serves it in about a
// second; a starved CI simulator was measured at 8 s from dialog to enabled
// (run 33750030091, iOS phone) and, at the very worst, 71 s to the first
// WebView commit (run 33319523590). The stall this guards against is a
// different animal: WebKit never sends the request at all — the pay page
// reached the store five minutes after the tap (run 33758920470, iOS phone)
// or never (run 33750030091, iPad), and WebKit's own 60 s request timeout
// cannot fire for a request that never left the process. Without a way out
// the cashier is left with the spinner #1024 was meant to end. 90 s sits past
// every real load ever measured and well short of the stall. A reload
// restarts the navigation WebKit dropped; a second stall is reported as a
// failure with a Retry rather than hidden behind more waiting.
export const PAYMENT_FRAME_LOAD_TIMEOUT_MS = 90_000;

interface PayFrameInput {
	/** The tokenized pay-page URL; empty while there is no frame. */
	src: string;
	/** Bumped by the host's Retry: a remount, and the silent reload is spent. */
	retryToken: number;
	prepared: 'ready' | 'failed' | null;
	report: (status: PaymentFrameStatus) => void;
	/** A load after the first: a later document (the post-payment hop) that may need reconciling. */
	onLaterDocument: () => void;
	logger: CategoryLogger;
}

/**
 * The pay frame's load events, re-gate and first-document watchdog. Android's finish-then-error
 * is the engine's: the error arrives marked `retractsLoad`. `hold` ignores loads and the watchdog
 * during a session refresh; `expire` latches failed until `src` changes; `remount` re-keys.
 */
export function usePayFrame(input: PayFrameInput) {
	const { src, retryToken, prepared, report, onLaterDocument, logger } = input;
	const loadCountRef = React.useRef(0);
	// Whether the load the engine may retract is one this hook counted: a load ignored
	// while held never counted, so its retraction must not undo an earlier one.
	const countedSinceStartRef = React.useRef(false);
	// The load watchdog's bookkeeping. `autoReloads` counts the one silent
	// reload; `navigationStarts` re-arms the watchdog on a load-start event;
	// `frameSettledRef` is set by the load or error event that ends a navigation,
	// so a timer that fires after one is a no-op. The frame's key derives from
	// the retry token and the reload count: a remount is a fresh navigation on
	// both platforms (the web iframe has no reload API) and drops whatever
	// WebKit was, or was not, doing with the old one.
	const [autoReloads, setAutoReloads] = React.useState(0);
	const [navigationStarts, setNavigationStarts] = React.useState(0);
	const [remounts, setRemounts] = React.useState(0);
	const frameSettledRef = React.useRef(false);
	const heldRef = React.useRef(false);
	// The frame holds an expired token (a failed refresh, or the reload cap), so it stays
	// failed — no load event may report it ready and the watchdog must not remount the same
	// expired URL — until the URL itself changes (a new token, from a refresh anywhere).
	const expiredRef = React.useRef(false);
	const key = `${retryToken}:${autoReloads}:${remounts}`;

	React.useEffect(() => {
		expiredRef.current = false;
	}, [src]);

	/**
	 * The store's order-pay template registers its `wcpos-process-payment`
	 * listener in a synchronous <head> script, so the frame's load event is
	 * strictly after that listener exists. It is the strongest readiness
	 * signal either platform exposes — the template sends no ready message —
	 * so the checkout footer gates on it (#1024).
	 *
	 * The first load is the initial order-pay page, where a payment cannot have
	 * completed yet; only later loads (the post-payment redirect) are reported.
	 */
	const onLoad = React.useCallback(() => {
		if (heldRef.current || expiredRef.current) return;
		report('ready');
		frameSettledRef.current = true;
		countedSinceStartRef.current = true;
		loadCountRef.current += 1;
		if (loadCountRef.current >= 2) onLaterDocument();
	}, [report, onLaterDocument]);

	/**
	 * Navigating away — a gateway redirect, the post-payment hop — puts a document
	 * under the frame that has no `wcpos-process-payment` listener until it, too,
	 * has loaded. Re-gate so a second press cannot post into it.
	 *
	 * Native only: the web WebView renders an <iframe>, which exposes no
	 * navigation-start event for a cross-origin document. Passing the prop there
	 * is inert. That residual web gap is one of the reasons a store-side ack is
	 * the real fix rather than this gate.
	 */
	const onLoadStart = React.useCallback(() => {
		// An expired frame stays failed: its navigation must not reopen the gate.
		if (expiredRef.current) return;
		countedSinceStartRef.current = false;
		report('loading');
		// Only the first document is watched. Later navigations are the gateway's
		// (a redirect, the post-payment hop); a stalled one is the fallback poll's
		// business, and a remount there would put the pay page back under a sale
		// that may already be paid.
		if (loadCountRef.current === 0) {
			frameSettledRef.current = false;
			setNavigationStarts((n) => n + 1);
		}
	}, [report]);

	/**
	 * A load that errors produces no load event, so the gate has to be told or it
	 * stays shut forever. Native surfaces this reliably; on web an <iframe> only
	 * fires `error` for a hard failure (a 404 *page* still loads), which is one
	 * more reason the honest readiness signal has to come from the store.
	 */
	const onError = React.useCallback(
		(event: unknown) => {
			const nativeEvent = (event as { nativeEvent?: Record<string, unknown> } | undefined)
				?.nativeEvent;
			// The engine says the load counted for this navigation was a synthetic finish for
			// the document that just failed (Android): it never loaded, so it does not count.
			if (nativeEvent?.retractsLoad === true && countedSinceStartRef.current) {
				loadCountRef.current = Math.max(0, loadCountRef.current - 1);
			}
			countedSinceStartRef.current = false;
			report(loadCountRef.current === 0 ? 'stalled' : 'failed');
			frameSettledRef.current = true;
			logger.warn('Payment form failed to load in the checkout frame', {
				context: {
					description: nativeEvent?.description,
					code: nativeEvent?.code,
				},
			});
		},
		[logger, report]
	);

	/**
	 * A new payment URL swaps the document under the frame, so the gate closes
	 * until the replacement reports its own load. The unmount cleanup means a
	 * remounted frame (mode change, stock rejection cleared) never starts open.
	 *
	 * The load counter resets with it: the fallback poll deliberately skips the
	 * *first* load because a payment cannot have completed yet, and a re-hosted
	 * document is a first load, not a post-payment navigation.
	 *
	 * `useLayoutEffect`, not `useEffect`: the new `src` is committed to the DOM in
	 * the same commit, and a passive effect would leave the gate reporting `ready`
	 * against the replacement document until after paint — a window in which a
	 * press posts into a document that is still loading. This closes it before the
	 * cashier can see, let alone touch, the frame.
	 */
	React.useLayoutEffect(() => {
		loadCountRef.current = 0;
		frameSettledRef.current = false;
		countedSinceStartRef.current = false;
		report(prepared === 'failed' ? 'stalled' : 'loading');
		return () => report('loading');
	}, [src, key, prepared, report]);

	/**
	 * The load watchdog. Runs for every navigation of the first document (a new
	 * URL, a remount, a load-start event); the load or error event that ends the
	 * navigation settles it, so a timer that fires afterwards does nothing.
	 * Firing unsettled means neither event arrived: the navigation stalled
	 * before it reached the network, the case WebKit's own timeout never sees.
	 * The silent reload is spent by the cashier's Retry — the attempt they asked
	 * for either loads or is reported.
	 */
	React.useEffect(() => {
		// No link, no frame, no navigation to watch: the banner already says so.
		if (!src) return;
		const timer = setTimeout(() => {
			if (frameSettledRef.current || heldRef.current || expiredRef.current) return;
			if (autoReloads === 0 && retryToken === 0) {
				// An automatic retry; the row that matters is the one below if it fails too.
				logger.debug('Payment form did not load in time; reloading it once', {
					context: { timeoutMs: PAYMENT_FRAME_LOAD_TIMEOUT_MS },
				});
				setAutoReloads(1);
				return;
			}
			logger.warn('Payment form did not load after a reload; waiting for the cashier', {
				context: { timeoutMs: PAYMENT_FRAME_LOAD_TIMEOUT_MS, retryToken },
			});
			report('stalled');
		}, PAYMENT_FRAME_LOAD_TIMEOUT_MS);
		return () => clearTimeout(timer);
	}, [src, key, navigationStarts, autoReloads, retryToken, logger, report]);

	const hold = React.useCallback(() => {
		heldRef.current = true;
		report('loading');
	}, [report]);
	const release = React.useCallback(() => {
		heldRef.current = false;
	}, []);
	const expire = React.useCallback(() => {
		expiredRef.current = true;
		report('failed');
	}, [report]);
	const remount = React.useCallback(() => setRemounts((n) => n + 1), []);

	return { key, handlers: { onLoad, onLoadStart, onError }, hold, release, expire, remount };
}
