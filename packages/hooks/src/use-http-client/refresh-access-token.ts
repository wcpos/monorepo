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
	// A terminal auth failure stays latched until re-authentication clears it. The engine's
	// scheduler lanes have no authFailed preflight of their own (that guard lives in the app's
	// useHttpClient, which the engine bypasses), so without this every tick would POST
	// /auth/refresh again indefinitely once the refresh token is known-bad.
	if (requestStateManager.isAuthFailed()) {
		return null;
	}

	const latestDoc = wpUser.getLatest();
	const refreshToken = latestDoc?.refresh_token;
	const apiBaseUrl = site.wcpos_api_url || (site.wp_api_url ? `${site.wp_api_url}wcpos/v1/` : null);
	// Normalize the trailing slash so `${apiUrl}auth/refresh` never collapses into
	// `.../wcpos/v1auth/refresh` when wcpos_api_url is stored without one.
	const apiUrl = apiBaseUrl ? (apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`) : null;

	if (!refreshToken) {
		// No refresh token to spend — refreshing is impossible, so this is terminal.
		tokenLogger.debug('Skipping token refresh - no refresh token', {
			context: { hasWcposApiUrl: !!site.wcpos_api_url, hasWpApiUrl: !!site.wp_api_url },
		});
		requestStateManager.setAuthFailed(true);
		return null;
	}

	if (!apiUrl) {
		// The site can be transiently un-hydrated (e.g. after a web wake, before
		// wcpos_api_url / wp_api_url resolve). Treat as retryable — do NOT latch authFailed.
		tokenLogger.debug('Skipping token refresh - API URL unavailable', {
			context: { hasWcposApiUrl: !!site.wcpos_api_url, hasWpApiUrl: !!site.wp_api_url },
		});
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

		// No token without an error means a concurrent refresh yielded nothing — retryable,
		// not terminal, so leave authFailed alone.
		return requestStateManager.getRefreshedToken() ?? null;
	} catch (error) {
		// Only a rejected refresh token (401/403/404 from /auth/refresh) is terminal. Transient
		// failures — 5xx, a thrown network error, a malformed 2xx body — must stay retryable, or
		// a momentary blip would log the cashier out mid-session.
		const terminal = isTerminalRefreshFailure(error);
		tokenLogger.warn('Unable to refresh session', {
			saveToDb: terminal,
			context: {
				errorCode: ERROR_CODES.TOKEN_REFRESH_FAILED,
				error: error instanceof Error ? error.message : String(error),
				terminal,
				userId: wpUser.id,
				siteUrl: site.url,
			},
		});
		if (terminal) {
			requestStateManager.setAuthFailed(true);
		}
		return null;
	}
}

/**
 * A refresh failure is terminal only when the server rejects the refresh token itself
 * (401/403/404 from /auth/refresh → re-auth required). Everything else — a 5xx, a thrown network
 * error, or a malformed success body — is transient and must stay retryable, or a momentary blip
 * would log the cashier out mid-session.
 */
function isTerminalRefreshFailure(error: unknown): boolean {
	const status = refreshFailureStatus(error);
	return status === 401 || status === 403 || status === 404;
}

/**
 * Recover the HTTP status from a refresh failure across client shapes: a structured `status`
 * (createRefreshHttpClient), an axios-style `response.status`, or the leading status code in a
 * `HTTP <status>: …` / `<status> <text>` message. Undefined for network errors (no status).
 */
function refreshFailureStatus(error: unknown): number | undefined {
	if (error && typeof error === 'object') {
		const shaped = error as { status?: unknown; response?: { status?: unknown } };
		if (typeof shaped.status === 'number') return shaped.status;
		if (typeof shaped.response?.status === 'number') return shaped.response.status;
	}
	const message = error instanceof Error ? error.message : String(error);
	const match = /\b(\d{3})\b/.exec(message);
	return match ? Number(match[1]) : undefined;
}
