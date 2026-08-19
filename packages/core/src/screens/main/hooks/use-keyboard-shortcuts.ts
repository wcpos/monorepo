import { useRouter } from 'expo-router';

import { useHotkeys } from '@wcpos/hooks/use-hotkeys';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useAppState } from '../../../contexts/app-state';

const shortcutsLogger = getLogger(['wcpos', 'ui', 'shortcuts']);

export const useKeyboardShortcuts = () => {
	const router = useRouter();
	const { logout } = useAppState();

	/** Settings */
	useHotkeys('ctrl+shift+s', (event, handler) => {
		router.push('/settings');
	});

	/** Logout */
	useHotkeys('ctrl+shift+l', (event, handler) => {
		logout().catch((error) => {
			shortcutsLogger.error('Logout shortcut failed', {
				code: ERROR_CODES.AUTH_UNEXPECTED,
				context: { error },
			});
		});
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
