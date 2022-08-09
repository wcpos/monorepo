import * as React from 'react';
import NetInfo, {
	// useNetInfo,
	NetInfoState,
	NetInfoStateType,
} from '@react-native-community/netinfo';
import useSnackbar from '@wcpos/components/src/snackbar';
import useAuth from '../use-auth';

const initialState: NetInfoState = {
	type: NetInfoStateType.unknown,
	isConnected: null,
	isInternetReachable: null,
	details: null,
};

export const OnlineStatusContext = React.createContext<NetInfoState>(initialState);

interface Props {
	children: React.ReactNode;
}

const OnlineStatusProvider = ({ children }: Props) => {
	const { site } = useAuth();
	const addSnackbar = useSnackbar();
	const [status, setStatus] = React.useState<NetInfoState>(initialState);

	/**
	 * Listen to internet connection
	 * note: there is no removeEventListener, it returns the unsubscribe function
	 */
	React.useEffect(() => {
		NetInfo.configure({
			reachabilityUrl: site?.wp_api_url,
			reachabilityTest: async (response) => response.status === 200,
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
						addSnackbar({ message: 'No internet connection' });
					} else {
						addSnackbar({ message: 'Your website is down' });
					}
				}
				if (prev.isInternetReachable === false && netInfo.isInternetReachable === true) {
					if (prev.isConnected === false && netInfo.isConnected === true) {
						addSnackbar({ message: 'Internet reconnected' });
					} else {
						addSnackbar({ message: 'Your website is up' });
					}
				}
				return netInfo;
			});
		});

		// Unsubscribe
		return unsubscribe;
	}, [addSnackbar, site?.wp_api_url]);

	return <OnlineStatusContext.Provider value={status}>{children}</OnlineStatusContext.Provider>;
};

export default OnlineStatusProvider;
