import * as React from 'react';

import { router } from 'expo-router';

import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useAppState } from '../../../contexts/app-state';

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
	site: import('@wcpos/database').SiteDocument
): UseLoginHandlerReturn => {
	const { userDB } = useAppState();
	const [isProcessing, setIsProcessing] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	// Logger available as 'log'

	const handleLoginSuccess = React.useCallback(
		async (response: LoginResponse): Promise<void> => {
			setIsProcessing(true);
			setError(null);

			try {
				log.debug('Processing login success response', {
					context: { response },
				});

				const { params } = response;

				// Validate required response parameters
				if (!params.uuid || !params.access_token || !params.refresh_token) {
					log.error('Invalid login response - missing required parameters', {
						showToast: true,
						context: {
							errorCode: ERROR_CODES.MISSING_REQUIRED_PARAMETERS,
						},
					});
					throw new Error('Invalid login response - missing required parameters');
				}

				// Extract credentials from the response
				const credentialsData = {
					uuid: params.uuid,
					id: parseInt(params.id, 10), // Convert string to number
					display_name: params.display_name,
					access_token: params.access_token,
					refresh_token: params.refresh_token,
					expires_at: Number(params.expires_at), // Convert to number and store the expiration timestamp
					// Set default values for other required fields
					first_name: '',
					last_name: '',
					email: '',
					nice_name: params.display_name,
					last_access: new Date().toISOString(),
					avatar_url: '',
					stores: [],
					date_created_gmt: new Date().toISOString(),
					date_modified_gmt: new Date().toISOString(),
				};

				// Check if credentials already exist
				const existingCredentials = await userDB.wp_credentials
					.findOne({
						selector: { uuid: credentialsData.uuid },
					})
					.exec();

				if (existingCredentials) {
					// Update existing credentials with new tokens
					await existingCredentials.incrementalPatch({
						access_token: credentialsData.access_token,
						refresh_token: credentialsData.refresh_token,
						expires_at: credentialsData.expires_at,
						display_name: credentialsData.display_name,
						last_access: credentialsData.last_access,
						date_modified_gmt: credentialsData.date_modified_gmt,
					});

					log.debug(`Updated credentials for ${credentialsData.display_name}`);
				} else {
					// Create new credentials
					await userDB.wp_credentials.insert(credentialsData);
					log.debug(`Created credentials for ${credentialsData.display_name}`);
				}

				// Link credentials to site if not already linked
				const siteCredentials = site.wp_credentials || [];
				if (!siteCredentials.includes(credentialsData.uuid)) {
					await site.getLatest().incrementalPatch({
						wp_credentials: [...siteCredentials, credentialsData.uuid],
					});
					log.debug(`Linked ${credentialsData.display_name} to ${site.name}`);
				}

				log.info(`Login successful: ${credentialsData.display_name} at ${site.name}`);

				// Navigate back on success
				router.back();
			} catch (err) {
				const errorMessage = err.message || 'Failed to save WordPress credentials';

				// Determine error type and code based on error characteristics
				let errorCode = ERROR_CODES.QUERY_SYNTAX_ERROR; // Default
				if (err.message?.includes('missing required parameters')) {
					errorCode = ERROR_CODES.QUERY_SYNTAX_ERROR;
				} else if (err.name === 'ValidationError') {
					errorCode = ERROR_CODES.QUERY_SYNTAX_ERROR;
				} else if (err.name === 'RxError') {
					errorCode = ERROR_CODES.QUERY_SYNTAX_ERROR;
				}

				log.error(`Failed to save WordPress credentials: ${errorMessage}`, {
					showToast: true,
					context: {
						errorCode,
					},
				});

				setError(errorMessage);
			} finally {
				setIsProcessing(false);
			}
		},
		[userDB.wp_credentials, site]
	);

	return {
		handleLoginSuccess,
		isProcessing,
		error,
	};
};
