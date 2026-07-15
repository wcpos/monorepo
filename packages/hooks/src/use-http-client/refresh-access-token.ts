import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { pauseQueue, resumeQueue } from './request-queue';
import { requestStateManager } from './request-state-manager';

const tokenLogger = getLogger(['wcpos', 'auth', 'token']);

export interface WPCredentialsDocument {
	id?: number;
	refresh_token?: string;
	incrementalPatch: (data: { access_token: string; expires_at: number }) => Promise<unknown>;
	getLatest: () => WPCredentialsDocument;
}

interface RefreshHttpClient {
	post: (
		url: string,
		data: { refresh_token: string },
		config?: { headers?: Record<string, string> }
	) => Promise<unknown>;
}

export interface RefreshAccessTokenConfig {
	site: {
		wcpos_api_url?: string;
		wp_api_url?: string;
		use_jwt_as_param?: boolean;
		url?: string;
	};
	wpUser: WPCredentialsDocument;
	getHttpClient: () => RefreshHttpClient;
}

interface TokenRefreshResponse {
	access_token: string;
	expires_at: number;
}

function isTokenRefreshResponse(data: unknown): data is TokenRefreshResponse {
	if (!data || typeof data !== 'object') return false;
	const response = data as Record<string, unknown>;
	return typeof response.access_token === 'string' && typeof response.expires_at === 'number';
}

function getResponseData(response: unknown): unknown {
	if (!response || typeof response !== 'object') return undefined;
	return (response as Record<string, unknown>).data;
}

/**
 * Refresh the current access token, sharing one in-flight operation across all callers.
 */
export async function refreshAccessToken({
	site,
	wpUser,
	getHttpClient,
}: RefreshAccessTokenConfig): Promise<string | null> {
	const latestDoc = wpUser.getLatest();
	const refreshToken = latestDoc?.refresh_token;
	const apiUrl = site.wcpos_api_url || (site.wp_api_url ? `${site.wp_api_url}wcpos/v1/` : null);

	if (!apiUrl || !refreshToken) {
		tokenLogger.debug('Skipping token refresh - missing required data', {
			context: {
				hasWcposApiUrl: !!site.wcpos_api_url,
				hasWpApiUrl: !!site.wp_api_url,
				hasApiUrl: !!apiUrl,
				hasRefreshToken: !!refreshToken,
			},
		});
		requestStateManager.setAuthFailed(true);
		return null;
	}

	try {
		await requestStateManager.startTokenRefresh(async () => {
			pauseQueue();
			try {
				const response = await getHttpClient().post(
					`${apiUrl}auth/refresh`,
					{ refresh_token: refreshToken },
					{ headers: { 'X-WCPOS': '1' } }
				);

				const responseData = getResponseData(response);
				if (!isTokenRefreshResponse(responseData)) {
					throw new Error('REFRESH_TOKEN_INVALID');
				}

				const { access_token, expires_at } = responseData;
				await wpUser.incrementalPatch({ access_token, expires_at });
				return access_token;
			} finally {
				resumeQueue();
			}
		});

		const refreshedToken = requestStateManager.getRefreshedToken();
		if (!refreshedToken) {
			requestStateManager.setAuthFailed(true);
			return null;
		}

		return refreshedToken;
	} catch (error) {
		tokenLogger.warn('Unable to refresh session', {
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.TOKEN_REFRESH_FAILED,
				error: error instanceof Error ? error.message : String(error),
				userId: wpUser.id,
				siteUrl: site.url,
			},
		});
		requestStateManager.setAuthFailed(true);
		return null;
	}
}
