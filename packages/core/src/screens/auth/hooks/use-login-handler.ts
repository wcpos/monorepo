import * as React from 'react';

import { router } from 'expo-router';

import { getLogger, isErrorReported, markErrorReported } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { type ReadonlySiteRecord, saveLoginCredentials } from '@wcpos/query/user-db';

import { useAppState } from '../../../contexts/app-state';

const authLogger = getLogger(['wcpos', 'auth', 'login']);

interface LoginResponse {
	params: {
		access_token: string;
		refresh_token: string;
		uuid: string;
		id: string;
		display_name: string;
		expires_at: number;
		token_type?: string;
	};
}

interface UseLoginHandlerReturn {
	handleLoginSuccess: (response: LoginResponse) => Promise<void>;
	isProcessing: boolean;
	error: string | null;
}

/**
 * Hook for handling OAuth login responses and saving credentials
 */
export const useLoginHandler = (
	site: Pick<ReadonlySiteRecord, 'uuid' | 'name'> | null
): UseLoginHandlerReturn => {
	const { userDB } = useAppState();
	const [isProcessing, setIsProcessing] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const handleLoginSuccess = React.useCallback(
		async (response: LoginResponse): Promise<void> => {
			// Guard: site must be available
			if (!site) {
				authLogger.debug('Login handler called but site is not yet available, skipping');
				return;
			}

			setIsProcessing(true);
			setError(null);

			try {
				const { params } = response;

				// Never log the raw response - it carries access/refresh tokens.
				authLogger.debug('Processing login success response', {
					context: { uuid: params.uuid, id: params.id, display_name: params.display_name },
				});

				// Validate required response parameters
				if (!params.uuid || !params.access_token || !params.refresh_token) {
					authLogger.error('Invalid login response - missing required parameters', {
						showToast: true,
						code: ERROR_CODES.AUTH_UNEXPECTED,
					});
					const invalid = new Error('Invalid login response - missing required parameters');
					markErrorReported(invalid);
					throw invalid;
				}

				const { created, linked, credentials } = await saveLoginCredentials(
					userDB,
					site.uuid,
					params
				);
				const credentialsData = { ...params, id: parseInt(params.id, 10), stores: [] };
				if (!created) {
					authLogger.debug(`[stores] Updated credentials for ${credentialsData.display_name}`, {
						context: {
							wpUserUuid: credentialsData.uuid,
							userId: credentialsData.id,
							existingStores: credentials.stores,
						},
					});
				} else {
					authLogger.debug(`[stores] Created credentials for ${credentialsData.display_name}`, {
						context: {
							wpUserUuid: credentialsData.uuid,
							userId: credentialsData.id,
							initialStores: credentialsData.stores,
						},
					});
				}

				if (linked) {
					authLogger.debug(`Linked ${credentialsData.display_name} to ${site.name}`);
				}

				authLogger.info(`Login successful: ${credentialsData.display_name} at ${site.name}`);

				// Navigate back on success (only if we can go back)
				if (router.canGoBack()) {
					router.back();
				}
			} catch (err: unknown) {
				const errorMessage =
					(err instanceof Error ? err.message : '') || 'Failed to save WordPress credentials';

				// One failure, one row and one toast. An invalid login response already
				// wrote its AUTH999 row above; anything else is the local credential write.
				if (!isErrorReported(err)) {
					authLogger.error(`Failed to save WordPress credentials: ${errorMessage}`, {
						code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
						showToast: true,
						context: {
							error: errorMessage,
						},
					});
				}

				setError(errorMessage);
				// Rethrown (marked reported) so no caller goes on to announce a renewed
				// session or clear the auth hold for credentials that were never saved.
				markErrorReported(err);
				throw err;
			} finally {
				setIsProcessing(false);
			}
		},
		[userDB, site]
	);

	return {
		handleLoginSuccess,
		isProcessing,
		error,
	};
};
