import { useRouter } from 'expo-router';

import { useHotkeys } from '@wcpos/hooks/use-hotkeys';

import { useAppState } from '../../../contexts/app-state';

export const useKeyboardShortcuts = () => {
	const router = useRouter();
	const { logout } = useAppState();

	/** Settings Modal */
	useHotkeys('ctrl+shift+s', (event, handler) => {
		router.push('/(app)/(modals)/settings');
	});

	/** Settings Modal */
	useHotkeys('ctrl+shift+l', (event, handler) => {
		logout();
	});

	/** Main POS page */
	useHotkeys('ctrl+shift+a', (event, handler) => {
		router.push('/(app)/(drawer)/pos');
	});

	/** Products */
	useHotkeys('ctrl+shift+p', (event, handler) => {
		router.push('/(app)/(drawer)/products');
	});

	/** Orders */
	useHotkeys('ctrl+shift+o', (event, handler) => {
		router.push('/(app)/(drawer)/orders');
	});

	/** Customers */
	useHotkeys('ctrl+shift+c', (event, handler) => {
		router.push('/(app)/(drawer)/customers');
	});

	/** Support */
	useHotkeys('ctrl+shift+?', (event, handler) => {
		router.push('/(app)/(drawer)/support');
	});
};
