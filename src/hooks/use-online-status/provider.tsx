import * as React from 'react';
import NetInfo, {
	// useNetInfo,
	NetInfoState,
	NetInfoStateType,
} from '@react-native-community/netinfo';
import useAppState from '../use-app-state';
import useSnackbar from '../../components/snackbar';

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
	const { site } = useAppState();
	const addSnackbar = useSnackbar();
	const [status, setStatus] = React.useState<NetInfoState>(initialState);

	/**
	 * Listen to internet connection
	 * note: there is no removeEventListener, it returns the unsubscribe function
	 */
	React.useEffect(() => {
		NetInfo.configure({
			reachabilityUrl: site.wp_api_url,
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
			setStatus(netInfo);
		});

		// Unsubscribe
		return unsubscribe;
	}, [site.wp_api_url]);

	// // Show a warning if the user is offline
	React.useEffect(() => {
		if (status.isInternetReachable === false) {
			addSnackbar({ message: 'You are offline' });
		}
	}, [status]);

	return <OnlineStatusContext.Provider value={status}>{children}</OnlineStatusContext.Provider>;
};

export default OnlineStatusProvider;
