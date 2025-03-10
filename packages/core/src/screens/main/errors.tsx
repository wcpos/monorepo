import * as React from 'react';

import { useSubscription } from 'observable-hooks';

import { Toast } from '@wcpos/components/toast';
import { useQueryManager } from '@wcpos/query';
import log from '@wcpos/utils/logger';

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
