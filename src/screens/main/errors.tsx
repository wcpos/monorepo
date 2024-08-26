import * as React from 'react';

import { useSubscription } from 'observable-hooks';

import { useQueryManager } from '@wcpos/query';
import { Toast } from '@wcpos/components/src/toast';
import log from '@wcpos/utils/src/logger';

/**
 * TODO - we need a app-wide event bus to channel errors to the snackbar
 * This should be part of a app-wide event logging system
 */
export const Errors = () => {
	const manager = useQueryManager();

	/**
	 *
	 */
	useSubscription(manager.error$, (error) => {
		log.error(error);
		Toast.show({
			type: 'error',
			text1: error.message,
		});
	});

	return null;
};
