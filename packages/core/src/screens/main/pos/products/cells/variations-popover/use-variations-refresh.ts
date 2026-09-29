import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';

const logger = getLogger(['wcpos', 'pos', 'variations-popover']);

// Run 33357460009 (iOS tablet, 2026-08-31): the popover's single mount-time
// refresh issued ONE GET /wcpos/v2/variations which died in 809 ms (status 0,
// engine SYNC121 - the request was cancelled client-side) and NOTHING retried:
// the popover showed "Syncing..." for the 10 minutes the E2E flow kept tapping
// greyed options. sync() swallows per-handle failures by design, so the caller
// cannot see the failure - the only honest recovery is to watch the RESULT and
// re-ask while it stays empty. Two spaced retries cover a transient failure; a
// parent whose variations genuinely are not on the server stops the loop when
// the retries are spent, and every retry logs so CI artifacts can count
// firings. Values in code, not env - nobody tunes this without editing it.
export const VARIATION_SYNC_RETRY_DELAYS_MS = [3000, 10000];

// Run 33382238335 (iOS phone, 2026-08-31, WITH the retry above aboard): the
// wedge recurred with ZERO retry logs and ZERO engine request WARNs in the
// whole popover window - sync() never SETTLED (a hang before/at the wire, not
// a fast failure), and a retry that chains on resolution never scheduled. A
// refresh that has not settled in 15 s is treated as failed: logged, and the
// retry loop proceeds. 15 s is far above a healthy refresh (sub-second to a
// few seconds) and well inside the E2E flow's 20 s option-tap windows.
export const VARIATION_SYNC_SETTLE_TIMEOUT_MS = 15000;

type RefreshBinding = { sync(): Promise<unknown> };
type ResultStream = {
	result$?: { subscribe(next: (result: { count: number }) => void): { unsubscribe(): void } };
};

/**
 * Refresh a variations binding once per mount without blocking locally resident
 * variations, then retry (bounded, logged) while no variation has materialized. The
 * popover has carried this since #1729/#1731; the drill-in pane (roadmap#388) shares it
 * so the default flow recovers from the same live failure.
 */
export function useVariationsRefresh(binding: RefreshBinding) {
	const initialBinding = React.useRef(binding);
	React.useEffect(() => {
		const openBinding = initialBinding.current;
		// Unknown until the binding reports. An UNKNOWN count is retryable: a live
		// query can delay its first emission while sync() hangs, and treating -1 as
		// "variations present" would silence the settle timeout - the exact zero-log
		// signature this effect exists to kill (CodeRabbit, #1731).
		let variationCount = -1;
		const subscription = (openBinding as RefreshBinding & ResultStream).result$?.subscribe(
			(result) => {
				variationCount = result.count;
			}
		);
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let attempt = 0;
		let settleTimer: ReturnType<typeof setTimeout> | undefined;
		const attemptSync = () => {
			// A retry timer scheduled while the count was 0 can fire AFTER result$
			// reported variations - skip the redundant refresh (CodeRabbit, #1729).
			if (cancelled || (attempt > 0 && variationCount > 0)) return;
			attempt += 1;
			// Race the refresh against the settle timeout: a HUNG sync() (see
			// VARIATION_SYNC_SETTLE_TIMEOUT_MS above) must still log and retry.
			let settled = false;
			const proceed = (timedOut: boolean) => {
				if (settled) return;
				settled = true;
				if (settleTimer !== undefined) clearTimeout(settleTimer);
				if (cancelled || variationCount > 0) return;
				const delay = VARIATION_SYNC_RETRY_DELAYS_MS[attempt - 1];
				if (delay === undefined) return;
				logger.warn(
					timedOut
						? 'Variation refresh did not settle in time, retrying'
						: 'Variation refresh yielded no variations, retrying',
					{ context: { attempt, retryInMs: delay, timedOut } }
				);
				timer = setTimeout(attemptSync, delay);
			};
			settleTimer = setTimeout(() => proceed(true), VARIATION_SYNC_SETTLE_TIMEOUT_MS);
			void openBinding
				.sync()
				.catch(() => undefined)
				.then(() => proceed(false));
		};
		attemptSync();
		return () => {
			cancelled = true;
			if (timer !== undefined) clearTimeout(timer);
			if (settleTimer !== undefined) clearTimeout(settleTimer);
			subscription?.unsubscribe();
		};
	}, []);
}
