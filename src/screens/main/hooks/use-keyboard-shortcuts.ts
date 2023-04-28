import { useNavigation } from '@react-navigation/native';

import { useHotkeys } from '@wcpos/hooks/src/use-hotkeys';

import useLogout from '../../../hooks/use-logout';

const useKeyboardShortcuts = () => {
	const navigation = useNavigation();
	const logout = useLogout();

	/** Settings Modal */
	useHotkeys('shift+s', (event, handler) => {
		navigation.navigate('Settings');
	});

	/** Settings Modal */
	useHotkeys('shift+l', (event, handler) => {
		logout();
	});

	/** Main POS page */
	useHotkeys('shift+a', (event, handler) => {
		navigation.navigate('POSStack');
	});

	/** Products */
	useHotkeys('shift+p', (event, handler) => {
		navigation.navigate('ProductsStack');
	});

	/** Orders */
	useHotkeys('shift+o', (event, handler) => {
		navigation.navigate('OrdersStack');
	});

	/** Customers */
	useHotkeys('shift+c', (event, handler) => {
		navigation.navigate('CustomersStack');
	});

	/** Support */
	useHotkeys('shift+?', (event, handler) => {
		navigation.navigate('SupportStack');
	});
};

export default useKeyboardShortcuts;
