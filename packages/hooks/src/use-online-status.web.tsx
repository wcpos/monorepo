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

/**
 * Check if the website is reachable by making a HEAD request
 */
async function checkWebsiteReachability(url: string): Promise<boolean> {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

		const response = await fetch(url, {
			method: 'HEAD',
			mode: 'no-cors', // Avoid CORS issues for reachability check
			cache: 'no-store',
			signal: controller.signal,
		});

		clearTimeout(timeoutId);
		// With no-cors, we can't read the status, but if it doesn't throw, the server responded
		return true;
	} catch {
		return false;
	}
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

	/**
	 * Perform a full connectivity check
	 */
	const checkConnectivity = React.useCallback(async () => {
		// Prevent multiple simultaneous checks
		if (checkInProgressRef.current) {
			return;
		}

		checkInProgressRef.current = true;

		try {
			// First check: Is the browser online?
			if (typeof navigator !== 'undefined' && !navigator.onLine) {
				setStatus('offline');
				return;
			}

			// Second check: Can we reach the website?
			const isReachable = await checkWebsiteReachability(wpAPIURL);

			if (isReachable) {
				setStatus('online-website-available');
			} else {
				setStatus('online-website-unavailable');
			}
		} finally {
			checkInProgressRef.current = false;
		}
	}, [wpAPIURL]);

	/**
	 * Subscribe to browser online/offline events.
	 * This is a legitimate useEffect for subscribing to external browser APIs.
	 */
	React.useEffect(() => {
		if (typeof window === 'undefined') return;

		const handleOnline = () => {
			// Browser says we're online - verify with reachability check
			checkConnectivity();
		};

		const handleOffline = () => {
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
				checkConnectivity();
			}
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	}, [checkConnectivity]);

	/**
	 * Periodic reachability check (every 30 seconds when online).
	 * This catches cases where the website becomes unavailable while we're online.
	 * Legitimate useEffect for setting up an interval timer.
	 */
	React.useEffect(() => {
		if (status === 'offline') {
			// Don't poll when we know we're offline
			return;
		}

		const intervalId = setInterval(() => {
			// Only check if the page is visible
			if (document.visibilityState === 'visible') {
				checkConnectivity();
			}
		}, 30000); // 30 seconds

		return () => clearInterval(intervalId);
	}, [status, checkConnectivity]);

	/**
	 * Initial connectivity check on mount.
	 * Legitimate useEffect for fetching initial data on mount.
	 */
	React.useEffect(() => {
		checkConnectivity();
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
