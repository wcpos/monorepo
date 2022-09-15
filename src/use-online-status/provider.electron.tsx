import * as React from 'react';
import useSnackbar from '@wcpos/components/src/snackbar';
import useAuth from '../use-auth';

type NetInfoState = import('@react-native-community/netinfo').NetInfoState;

const initialState: NetInfoState = {
	type: 'unknown',
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
		let timeoutRef = null;
		window.addEventListener('online', () => {
			debugger;
		});
		window.addEventListener('offline', () => {
			debugger;
		});

		/**
		 * Create axios instance (on main Electron thread)
		 * @TODO - should I import useHttpClient here?
		 * - this may make it circular, depending on how cancelled requests are handled
		 */
		const httpPromise = window.ipcRenderer.invoke('axios', {
			type: 'create',
			config: {
				method: 'head',
				baseUrl: site?.wp_api_url,
				timeout: 60 * 1000,
			},
		});

		async function ping() {
			/**
			 *
			 */
			const instanceID = await httpPromise;
			const response = await window.ipcRenderer.invoke('axios', {
				type: 'request',
				instanceID,
				// config: {
				// 	url: '',
				// },
			});

			if (response.status === 200) {
				setStatus((prev) => ({ ...prev, isConnected: true }));
			} else {
				// wait for a while and try again
				timeoutRef = setTimeout(ping, 5 * 1000);
			}
		}

		ping();

		return function cleanUp() {
			clearTimeout(timeoutRef);
		};
	}, [addSnackbar, site?.wp_api_url]);

	return <OnlineStatusContext.Provider value={status}>{children}</OnlineStatusContext.Provider>;
};

export default OnlineStatusProvider;
