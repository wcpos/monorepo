import * as React from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useOnline() {
	const [online, setOnline] = React.useState(false);

	/**
	 * Listen to internet connection
	 * note: there is no removeEventListener, it returns the unsubscribe function
	 */
	React.useEffect(() => {
		return NetInfo.addEventListener(({ isConnected }) => {
			setOnline(!!isConnected);
		});
	}, []);

	return online;
}
