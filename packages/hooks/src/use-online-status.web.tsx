/**
 * Web/Electron implementation of useOnlineStatus
 *
 * Uses native browser APIs instead of @react-native-community/netinfo which
 * is designed for React Native mobile apps.
 *
 * Key features:
 * - Uses navigator.onLine for basic connectivity
 * - Listens to 'online'/'offline' events
 * - Re-checks on visibilitychange (important for wake-from-sleep)
 * - Performs actual reachability check to the website
 */
import * as React from 'react';

import { checkWebsiteReachability } from './check-website-reachability';
import { lastNetworkResponseAt, subscribeNetworkPulse } from './network-pulse';
import {
	WEBSITE_UNAVAILABLE_CONFIRMATION_MS,
	WEBSITE_UNAVAILABLE_CONFIRMATION_TOLERANCE_MS,
} from './website-unavailable-confirmation';

export type OnlineStatus = 'offline' | 'online-website-unavailable' | 'online-website-available';

interface OnlineStatusState {
	status: OnlineStatus;
}

const initialState: OnlineStatusState = {
	status: 'online-website-available', // Optimistic default for web
};

export const OnlineStatusContext = React.createContext<OnlineStatusState>(initialState);

interface Props {
	children: React.ReactNode;
	wpAPIURL: string;
}

export function OnlineStatusProvider({ children, wpAPIURL }: Props) {
	const [status, setStatus] = React.useState<OnlineStatus>(() => {
		// Initial state based on navigator.onLine
		if (typeof navigator !== 'undefined' && !navigator.onLine) {
			return 'offline';
		}
		return 'online-website-available'; // Optimistic
	});

	// Ref to track if a check is in progress (prevent multiple simultaneous checks)
	const checkInProgressRef = React.useRef(false);
	const checkRequestedRef = React.useRef(false);
	// When the current run of failures started, or null if the site last
	// answered. Counting probes would not do: a wake fires `online` and
	// `visibilitychange` together and the queued checks run back-to-back, so two
	// failures can land seconds apart. The verdict is elapsed failure instead.
	const failingSinceRef = React.useRef<number | null>(null);

	/**
	 * Perform a full connectivity check
	 */
	const checkConnectivity = React.useCallback(async () => {
		// Prevent multiple simultaneous checks
		if (checkInProgressRef.current) {
			checkRequestedRef.current = true;
			return;
		}

		checkInProgressRef.current = true;

		try {
			do {
				checkRequestedRef.current = false;
				const browserOffline = typeof navigator !== 'undefined' && !navigator.onLine;
				if (browserOffline) {
					setStatus('offline');
				}

				const isReachable = await checkWebsiteReachability(wpAPIURL);

				if (isReachable) {
					failingSinceRef.current = null;
					setStatus('online-website-available');
				} else if (typeof navigator !== 'undefined' && !navigator.onLine) {
					// The link is down. That is the OS's verdict, not the website's, so it
					// needs no confirming and says nothing about the site.
					failingSinceRef.current = null;
					setStatus('offline');
				} else {
					const now = Date.now();
					// A clock that has rolled back would otherwise hold the verdict off
					// indefinitely; re-anchor rather than measure a negative window.
					if (failingSinceRef.current === null || failingSinceRef.current > now) {
						failingSinceRef.current = now;
					}

					if (
						now - failingSinceRef.current >=
						WEBSITE_UNAVAILABLE_CONFIRMATION_MS - WEBSITE_UNAVAILABLE_CONFIRMATION_TOLERANCE_MS
					) {
						setStatus('online-website-unavailable');
					}
					// Inside the window the status is left alone: an unconfirmed blip must
					// not raise the cashier's "Website is unreachable" toast or push the
					// request queue offline. A later probe decides.
				}
			} while (checkRequestedRef.current);
		} finally {
			checkInProgressRef.current = false;
		}
	}, [wpAPIURL]);

	/**
	 * A new store URL is a new question. AppLayout re-supplies `wpAPIURL` without
	 * remounting the provider, so failures gathered against the previous site
	 * would otherwise confirm this one on its very first failed probe.
	 */
	React.useEffect(() => {
		failingSinceRef.current = null;
	}, [wpAPIURL]);

	/**
	 * Subscribe to successful HTTP traffic as direct evidence that the site answered.
	 */
	React.useEffect(
		() =>
			subscribeNetworkPulse(wpAPIURL, () => {
				failingSinceRef.current = null;
				setStatus('online-website-available');
			}),
		[wpAPIURL]
	);

	/**
	 * Subscribe to browser online/offline events.
	 * This is a legitimate useEffect for subscribing to external browser APIs.
	 */
	React.useEffect(() => {
		if (typeof window === 'undefined') return;

		const handleOnline = () => {
			// Browser says we're online - verify with reachability check
			void checkConnectivity();
		};

		const handleOffline = () => {
			// A dropped link is not evidence against the website.
			failingSinceRef.current = null;
			setStatus('offline');
		};

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	}, [checkConnectivity]);

	/**
	 * Re-check connectivity when the page becomes visible.
	 * This is crucial for wake-from-sleep scenarios.
	 * Legitimate useEffect for subscribing to document.visibilitychange event.
	 */
	React.useEffect(() => {
		if (typeof document === 'undefined') return;

		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible') {
				// Page became visible (e.g., wake from sleep, tab switch)
				// Re-check connectivity
				void checkConnectivity();
			}
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	}, [checkConnectivity]);

	/**
	 * Periodic reachability check. Browser offline state must not stop recovery checks.
	 * Legitimate useEffect for setting up an interval timer.
	 */
	React.useEffect(() => {
		const intervalId = setInterval(() => {
			if (document.visibilityState === 'visible') {
				const lastResponseAt = lastNetworkResponseAt(wpAPIURL);
				// The shortcut must not outlive the connection: a pulse from just
				// before airplane mode is still "fresh" for up to 45s, and trusting
				// it while the browser reports offline would flip the dot back to a
				// false available. With the browser offline, always probe — live
				// traffic (the pulse subscription) and a succeeding probe both still
				// recover the Chromium onLine-misreport case.
				const browserOffline = typeof navigator !== 'undefined' && !navigator.onLine;
				const pulseAge = lastResponseAt === null ? null : Date.now() - lastResponseAt;
				if (!browserOffline && pulseAge !== null && pulseAge >= 0 && pulseAge < 45000) {
					setStatus('online-website-available');
				} else {
					void checkConnectivity();
				}
			}
		}, 30000); // 30 seconds

		return () => clearInterval(intervalId);
	}, [checkConnectivity, wpAPIURL]);

	/**
	 * Initial connectivity check on mount.
	 * Legitimate useEffect for fetching initial data on mount.
	 */
	React.useEffect(() => {
		void checkConnectivity();
	}, [checkConnectivity]);

	const value = React.useMemo(() => ({ status }), [status]);

	return <OnlineStatusContext.Provider value={value}>{children}</OnlineStatusContext.Provider>;
}

export const useOnlineStatus = () => {
	const context = React.useContext(OnlineStatusContext);

	if (context === undefined) {
		throw new Error(`useOnlineStatus must be called within OnlineStatusProvider`);
	}

	return context;
};
