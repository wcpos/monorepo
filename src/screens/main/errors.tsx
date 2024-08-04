import * as React from 'react';

import { useSubscription } from 'observable-hooks';

import { useQueryManager } from '@wcpos/query';
import { Toast } from '@wcpos/tailwind/src/toast';
import log from '@wcpos/utils/src/logger';

/**
 * TODO - we need a app-wide event bus to channel errors to the snackbar
 * This should be part of a app-wide event logging system
 */
export const ErrorSnackbar = () => {
	const manager = useQueryManager();

	/**
	 *
	 */
	useSubscription(manager.error$, (error) => {
		log.error(error);
		Toast.show({
			text1: error.message,
			type: 'error',
		});
	});

	return null;
};
