// {
// 	type: Types.NetInfoStateType.unknown,
// 	isConnected: null,
// 	isInternetReachable: null,
// 	details: null,
// }

import * as React from 'react';
import { useNetInfo, NetInfoState, NetInfoStateType } from '@react-native-community/netinfo';
import useAppState from '../use-app-state';
import { useSnackbar } from '../../components/snackbar/use-snackbar';

export const OnlineStatusContext = React.createContext<NetInfoState>({
	type: NetInfoStateType.unknown,
	isConnected: null,
	isInternetReachable: null,
	details: null,
});

interface ICurrentUserProps {
	children: React.ReactNode;
}

const CurrentUserProvider = ({ children }: ICurrentUserProps) => {
	const { site } = useAppState();
	const showSnackbar = useSnackbar({ message: 'No internet connection' });

	const netInfo = useNetInfo({
		reachabilityUrl: site.wpApiUrl,
		reachabilityTest: async (response) => {
			return response.status === 200;
		},
		// reachabilityLongTimeout: 60 * 1000, // 60s
		// reachabilityShortTimeout: 5 * 1000, // 5s
		// reachabilityRequestTimeout: 15 * 1000, // 15s
		// reachabilityShouldRun: () => true,
		// shouldFetchWiFiSSID: true // met iOS requirements to get SSID
	});

	// Show a warning if the user is offline
	React.useEffect(() => {
		if (!netInfo.isInternetReachable) {
			showSnackbar();
		}
	}, [netInfo.isInternetReachable]);

	return <OnlineStatusContext.Provider value={netInfo}>{children}</OnlineStatusContext.Provider>;
};

export default CurrentUserProvider;
