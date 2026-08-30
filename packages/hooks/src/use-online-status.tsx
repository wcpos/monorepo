import * as React from 'react';

import { useNetInfoInstance } from '@react-native-community/netinfo';

import { pingProbeUrl } from './reachability-url';
import { WEBSITE_UNAVAILABLE_CONFIRMATION_MS } from './website-unavailable-confirmation';

export type OnlineStatus = 'offline' | 'online-website-unavailable' | 'online-website-available';

interface OnlineStatusState {
	status: OnlineStatus;
}

const initialState: OnlineStatusState = {
	status: 'offline',
};

export const OnlineStatusContext = React.createContext<OnlineStatusState>(initialState);

interface Props {
	children: React.ReactNode;
	wpAPIURL: string;
}

export function OnlineStatusProvider({ children, wpAPIURL }: Props) {
	const [useLegacyReachabilityURL, setUseLegacyReachabilityURL] = React.useState(false);

	const config = React.useMemo(
		() => ({
			reachabilityUrl: useLegacyReachabilityURL ? wpAPIURL : pingProbeUrl(wpAPIURL),
			reachabilityTest: async (response: Response) => {
				if (!useLegacyReachabilityURL && response.status === 404) {
					setUseLegacyReachabilityURL(true);
					return true;
				}

				return response.status === 200;
			},
			reachabilityRequestTimeout: 60 * 1000, // 60s
		}),
		[useLegacyReachabilityURL, wpAPIURL]
	);

	const { netInfo } = useNetInfoInstance(false, config);

	// NetInfo flips `isInternetReachable` to false after a SINGLE failed ping —
	// any rejection, including one timeout or one 5xx from a proxy.
	const pingFailing = netInfo.isConnected === true && netInfo.isInternetReachable === false;
	const [pingFailureConfirmed, setPingFailureConfirmed] = React.useState(false);

	/**
	 * Hold the unavailable verdict until the failure has lasted the confirmation
	 * window. NetInfo keeps re-probing throughout, and the moment one succeeds it
	 * notifies with `true`, which clears both the timer and the pending verdict —
	 * so recovery costs nothing.
	 */
	React.useEffect(() => {
		if (!pingFailing) return;

		const timeout = setTimeout(
			() => setPingFailureConfirmed(true),
			WEBSITE_UNAVAILABLE_CONFIRMATION_MS
		);

		// Clearing the verdict on the way out keeps recovery immediate and starts
		// the next episode from zero evidence.
		return () => {
			clearTimeout(timeout);
			setPingFailureConfirmed(false);
		};
	}, [pingFailing]);

	const status = React.useMemo((): OnlineStatus => {
		// Device is offline: the OS link-layer state, which our own traffic cannot
		// spuriously trip.
		if (netInfo.isConnected === false) {
			return 'offline';
		}

		// Device is online but the ping is failing. Until that failure is
		// confirmed, stay optimistic — the same default this provider already uses
		// for an unknown state. An unconfirmed blip must not raise the cashier's
		// "Website is unreachable" toast or push the request queue offline.
		if (pingFailing) {
			return pingFailureConfirmed ? 'online-website-unavailable' : 'online-website-available';
		}

		// Reachable, or not yet known - assume everything is working
		return 'online-website-available';
	}, [netInfo.isConnected, pingFailing, pingFailureConfirmed]);

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
