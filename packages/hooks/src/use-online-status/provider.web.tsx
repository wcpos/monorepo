import * as React from 'react';

import { Toast } from '@wcpos/components/toast';

import useHttpClient from '../use-http-client';

const initialState = {
	type: 'unknown' as const, // Matches NetInfoStateType
	isConnected: null as boolean | null,
	isInternetReachable: null as boolean | null,
	details: null,
};

export const OnlineStatusContext = React.createContext(initialState);

interface Props {
	children: React.ReactNode;
	wpAPIURL: string;
}

const OnlineStatusProvider = ({ children, wpAPIURL }: Props) => {
	const [status, setStatus] = React.useState(initialState);
	const httpClient = useHttpClient();

	/**
	 * Check connection and reachability
	 */
	const checkConnection = React.useCallback(async () => {
		try {
			// Attempt to reach the specific API URL
			await httpClient.head(wpAPIURL, { timeout: 60000 }); // Timeout matches reachabilityRequestTimeout

			// If successful, we know the internet is connected and the website is reachable
			setStatus({
				type: 'wifi', // You can customize this if needed
				isConnected: true,
				isInternetReachable: true,
				details: null, // Add additional details here if available
			});
		} catch {
			// If the request fails, fall back to navigator.onLine
			setStatus({
				type: 'wifi', // Default to wifi or 'unknown'
				isConnected: navigator.onLine, // Check if the device is generally online
				isInternetReachable: false, // The specific website is not reachable
				details: null,
			});
		}
	}, [wpAPIURL, httpClient]);

	/**
	 * Setup periodic polling for connection checks
	 */
	React.useEffect(() => {
		let isMounted = true;

		const performCheck = async () => {
			if (isMounted) {
				await checkConnection();
			}
		};

		// Perform an initial check and start polling
		performCheck();
		const intervalId = setInterval(performCheck, 60000); // Check every 60 seconds

		return () => {
			isMounted = false;
			clearInterval(intervalId);
		};
	}, [wpAPIURL, httpClient, checkConnection]);

	/**
	 * Show toast notifications on status change
	 */
	React.useEffect(() => {
		setStatus((prev) => {
			if (prev.isInternetReachable === true && status.isInternetReachable === false) {
				if (status.isConnected === false) {
					Toast.show({ type: 'error', text1: 'No internet connection' });
				} else {
					Toast.show({ type: 'error', text1: 'Your website is down' });
				}
			}
			if (prev.isInternetReachable === false && status.isInternetReachable === true) {
				if (prev.isConnected === false && status.isConnected === true) {
					Toast.show({ type: 'success', text1: 'Internet reconnected' });
				} else {
					Toast.show({ type: 'success', text1: 'Your website is up' });
				}
			}
			return status;
		});
	}, [status]);

	return <OnlineStatusContext.Provider value={status}>{children}</OnlineStatusContext.Provider>;
};

export default OnlineStatusProvider;
