import * as React from 'react';

import { useNetInfoInstance } from '@react-native-community/netinfo';

import { Toast } from '@wcpos/components/toast';

interface NetInfoState {
	type: string;
	isConnected: boolean | null;
	isInternetReachable: boolean | null;
	details: any;
}

const initialState: NetInfoState = {
	type: 'unknown',
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
	const config = React.useMemo(
		() => ({
			reachabilityUrl: wpAPIURL,
			reachabilityTest: async (response: Response) => response.status === 200,
			reachabilityRequestTimeout: 60 * 1000, // 60s
		}),
		[wpAPIURL]
	);

	const { netInfo } = useNetInfoInstance(false, config);

	const [status, setStatus] = React.useState<NetInfoState>(initialState);

	React.useEffect(() => {
		if (
			netInfo.type !== status.type ||
			netInfo.isConnected !== status.isConnected ||
			netInfo.isInternetReachable !== status.isInternetReachable ||
			netInfo.details !== status.details
		) {
			setStatus(netInfo);
		}
	}, [netInfo, status]);

	// Keep a ref of the previous status for comparison
	const prevStatusRef = React.useRef<NetInfoState>(status);

	React.useEffect(() => {
		const prevStatus = prevStatusRef.current;

		if (prevStatus.isInternetReachable === true && status.isInternetReachable === false) {
			Toast.show({
				type: 'error',
				text1: status.isConnected === false ? 'No internet connection' : 'Your website is down',
			});
		} else if (prevStatus.isInternetReachable === false && status.isInternetReachable === true) {
			if (prevStatus.isConnected === false && status.isConnected === true) {
				Toast.show({ type: 'success', text1: 'Internet reconnected' });
			} else {
				Toast.show({ type: 'success', text1: 'Your website is up' });
			}
		}

		// Update the ref so we can compare next time
		prevStatusRef.current = status;
	}, [status]);

	return <OnlineStatusContext.Provider value={status}>{children}</OnlineStatusContext.Provider>;
};

export default OnlineStatusProvider;
