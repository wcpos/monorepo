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
		if (!error) return;

		// Check if error already has an error code
		let errorCode = (error as any).errorCode;

		// Detect if error is from HTTP (has response/request) or DB operation
		const isHttpError =
			error && ((error as any).response || (error as any).request || (error as any).isAxiosError);

		if (!errorCode) {
			if (isHttpError) {
				errorCode = ERROR_CODES.CONNECTION_REFUSED;
			} else if ((error as any).message?.includes('SQL')) {
				errorCode = ERROR_CODES.QUERY_SYNTAX_ERROR;
			} else {
				// Default to a generic system error if we can't classify
				errorCode = ERROR_CODES.SERVICE_UNAVAILABLE;
			}
		}

		const errorMessage =
			error.message || (isHttpError ? 'Failed to sync with server' : 'Query error');

		log.error(errorMessage, {
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
