import * as React from 'react';

import { useSubscription } from 'observable-hooks';

import { useQueryManager } from '@wcpos/query';
import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

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
		log.error(error.message || 'Query error', {
			showToast: true,
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.QUERY_SYNTAX_ERROR,
				error: error instanceof Error ? error.message : String(error),
			},
		});
	});

	return null;
};
