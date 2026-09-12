import * as React from 'react';

import { useRouter } from 'expo-router';

import { Toast } from '@wcpos/components/toast';
import type { StoreDocument } from '@wcpos/database';
import { Platform } from '@wcpos/utils/platform';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';

export function useSwitchStore() {
	const { switchStore } = useStoreSession();
	const router = useRouter();
	const t = useT();
	const [isSwitching, setIsSwitching] = React.useState(false);
	const uiLogger = getLogger(['wcpos', 'ui', 'menu']);
	const handleSwitchStore = async (nextStore: StoreDocument): Promise<void> => {
		setIsSwitching(true);
		try {
			await switchStore(nextStore);
			// The router owns the URL: passing the server store id as a param writes
			// `/?store=<id>` on web (so a refresh boots into the new store) without
			// clobbering Expo Router's own history state the way a manual
			// history.replaceState would. Boot-time `?store=` handling consumes and
			// removes the param as before.
			if (Platform.isWeb) {
				router.replace({
					pathname: '/',
					params: { store: String(nextStore.id) },
				});
			} else {
				router.replace('/');
			}
		} catch (error) {
			Toast.show({
				type: 'error',
				title: t('common.store_switch_failed'),
				description: getErrorMessage(error),
			});
			uiLogger.error('Store switch failed', {
				code: ERROR_CODES.UNEXPECTED_ERROR,
				context: { error },
			});
		} finally {
			setIsSwitching(false);
		}
	};

	return { handleSwitchStore, isSwitching };
}
