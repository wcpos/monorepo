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
	 * Handle query manager errors - could be from HTTP (replication) or DB (local query)
	 */
	useSubscription(manager.error$, (error) => {
		// Detect if error is from HTTP (has response/request) or DB operation
		const isHttpError = error && (error.response || error.request || error.isAxiosError);
		
		// Use appropriate error code based on error source
		const errorCode = isHttpError
			? ERROR_CODES.CONNECTION_REFUSED  // API error
			: ERROR_CODES.QUERY_SYNTAX_ERROR; // DB query error
		
		const errorMessage = isHttpError
			? 'Failed to sync with server'
			: 'Query error';
		
		log.error(error.message || errorMessage, {
			showToast: true,
			saveToDb: true,
			context: {
				errorCode,
				error: error instanceof Error ? error.message : String(error),
				isHttpError,
			},
		});
	});

	return null;
};
