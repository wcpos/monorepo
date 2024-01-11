import * as React from 'react';

import { useSubscription } from 'observable-hooks';

import { useSnackbar } from '@wcpos/components/src/snackbar/use-snackbar';
import { useQueryManager } from '@wcpos/query';
import log from '@wcpos/utils/src/logger';

/**
 * TODO - we need a app-wide event bus to channel errors to the snackbar
 * This should be part of a app-wide event logging system
 */
export const ErrorSnackbar = () => {
	const manager = useQueryManager();
	const addSnackbar = useSnackbar();

	/**
	 *
	 */
	useSubscription(manager.error$, (error) => {
		log.error(error);
		addSnackbar({
			message: error.message,
			type: 'critical',
		});
	});

	return null;
};
