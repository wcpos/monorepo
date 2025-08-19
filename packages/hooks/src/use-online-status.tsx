import * as React from 'react';

import { useNetInfoInstance } from '@react-native-community/netinfo';

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
	const config = React.useMemo(
		() => ({
			reachabilityUrl: wpAPIURL,
			reachabilityTest: async (response: Response) => response.status === 200,
			reachabilityRequestTimeout: 60 * 1000, // 60s
		}),
		[wpAPIURL]
	);

	const { netInfo } = useNetInfoInstance(false, config);

	const status = React.useMemo((): OnlineStatus => {
		// Device is offline
		if (netInfo.isConnected === false) {
			return 'offline';
		}

		// Device is online but website is unreachable
		if (netInfo.isConnected === true && netInfo.isInternetReachable === false) {
			return 'online-website-unavailable';
		}

		// Device is online and website is reachable
		if (netInfo.isConnected === true && netInfo.isInternetReachable === true) {
			return 'online-website-available';
		}

		// Optimistic default - assume everything is working
		return 'online-website-available';
	}, [netInfo.isConnected, netInfo.isInternetReachable]);

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
