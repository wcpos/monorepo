import * as React from 'react';

import NetInfo, {
	// useNetInfo,
	NetInfoState,
	NetInfoStateType,
} from '@react-native-community/netinfo';

import { Toast } from '@wcpos/components/src/toast';

import useHttpClient from '../use-http-client';

const initialState: NetInfoState = {
	type: NetInfoStateType.unknown,
	isConnected: null,
	isInternetReachable: null,
	details: null,
};

export const OnlineStatusContext = React.createContext<NetInfoState>(initialState);

interface Props {
	children: React.ReactNode;
	wpAPIURL: string;
}

const OnlineStatusProvider = ({ children, wpAPIURL }: Props) => {
	const [status, setStatus] = React.useState<NetInfoState>(initialState);
	const httpClient = useHttpClient();

	/**
	 * Listen to internet connection
	 * note: there is no removeEventListener, it returns the unsubscribe function
	 */
	React.useEffect(() => {
		NetInfo.configure({
			reachabilityUrl: wpAPIURL,
			reachabilityTest: async () => {
				try {
					// Perform a HEAD request to minimize response size
					const response = await httpClient.head(wpAPIURL, { timeout: 60000 }); // Match the timeout with reachabilityRequestTimeout
					return response.status === 200;
				} catch (error) {
					console.error('Custom reachability test failed', error);
					return false;
				}
			},
			// reachabilityLongTimeout: 60 * 1000, // 60s
			// reachabilityShortTimeout: 5 * 1000, // 5s
			// increase timeout for slow servers
			reachabilityRequestTimeout: 60 * 1000, // 60s
			// reachabilityShouldRun: () => true,
			// shouldFetchWiFiSSID: true,
		});

		// Subscribe
		const unsubscribe = NetInfo.addEventListener((netInfo) => {
			setStatus((prev) => {
				if (prev.isInternetReachable === true && netInfo.isInternetReachable === false) {
					if (netInfo.isConnected === false) {
						Toast.show({ type: 'error', text1: 'No internet connection' });
					} else {
						Toast.show({ type: 'error', text1: 'Your website is down' });
					}
				}
				if (prev.isInternetReachable === false && netInfo.isInternetReachable === true) {
					if (prev.isConnected === false && netInfo.isConnected === true) {
						Toast.show({ type: 'success', text1: 'Internet reconnected' });
					} else {
						Toast.show({ type: 'success', text1: 'Your website is up' });
					}
				}
				return netInfo;
			});
		});

		/**
		 * FIXME: Even though this unsubscribes, the fetch request is still running on logout
		 */
		return () => {
			unsubscribe();
		};
	}, [wpAPIURL]);

	return <OnlineStatusContext.Provider value={status}>{children}</OnlineStatusContext.Provider>;
};

export default OnlineStatusProvider;
