import { useNavigation } from '@react-navigation/native';

import { useHotkeys } from '@wcpos/hooks/src/use-hotkeys';

import { useAppStateManager } from '../../../contexts/app-state-manager';

const useKeyboardShortcuts = () => {
	const navigation = useNavigation();
	const { logout } = useAppStateManager();

	/** Settings Modal */
	useHotkeys('ctrl+shift+s', (event, handler) => {
		navigation.navigate('Settings');
	});

	/** Settings Modal */
	useHotkeys('ctrl+shift+l', (event, handler) => {
		logout();
	});

	/** Main POS page */
	useHotkeys('ctrl+shift+a', (event, handler) => {
		navigation.navigate('POSStack');
	});

	/** Products */
	useHotkeys('ctrl+shift+p', (event, handler) => {
		navigation.navigate('ProductsStack');
	});

	/** Orders */
	useHotkeys('ctrl+shift+o', (event, handler) => {
		navigation.navigate('OrdersStack');
	});

	/** Customers */
	useHotkeys('ctrl+shift+c', (event, handler) => {
		navigation.navigate('CustomersStack');
	});

	/** Support */
	useHotkeys('ctrl+shift+?', (event, handler) => {
		navigation.navigate('SupportStack');
	});
};

export default useKeyboardShortcuts;
