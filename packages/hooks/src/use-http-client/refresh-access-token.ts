import { AppInfo } from '@wcpos/utils/app-info';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import {
	deriveSyntheticPathBase,
	deriveSyntheticPathRoot,
	resolveRestTransport,
	toRestRouteUrl,
} from '@wcpos/utils/rest-transport';
import {
	CLIENT_HEADER,
	CLIENT_QUERY_PARAM,
	formatClientSignal,
	PROTOCOL_HEADER,
	PROTOCOL_QUERY_PARAM,
	SYNC_PROTOCOL_VERSION,
} from '@wcpos/utils/sync-protocol';

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
		use_rest_route_param?: boolean;
		use_protocol_headers?: boolean;
		wcpos_version?: string;
		url?: string;
	};
	wpUser: WPCredentialsDocument;
	getHttpClient: () => RefreshHttpClient;
	/**
	 * Localized copy for the one-per-cycle "Session renewed automatically" info
	 * row (#899). Callers with i18n access pass
	 * `t('auth.session_renewed_automatically')`; the English default keeps the
	 * breadcrumb when no translator is threaded through.
	 */
	sessionRenewedMessage?: string;
	/**
	 * The arc id of the request whose 401 drove this refresh, so the renewed
	 * breadcrumb chains to the absorbed attempt and its successful retry (#899).
	 */
	operationId?: string;
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
	sessionRenewedMessage,
	operationId,
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
	const persistedApiBaseUrl = site.wcpos_api_url?.replace(/\/wcpos\/v1\/?$/, '/wcpos/v2/');
	let apiBaseUrl = persistedApiBaseUrl || (site.wp_api_url ? `${site.wp_api_url}wcpos/v2/` : null);
	if (apiBaseUrl) apiBaseUrl = deriveSyntheticPathBase(apiBaseUrl);
	// Normalize the trailing slash so `${apiUrl}auth/refresh` never collapses into
	// `.../wcpos/v2auth/refresh` when wcpos_api_url is stored without one.
	const apiUrl = apiBaseUrl ? (apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`) : null;

	if (!refreshToken) {
		// No refresh token to spend — refreshing is impossible, so this is terminal.
		tokenLogger.debug('Skipping token refresh - no refresh token', {
			context: {
				hasWcposApiUrl: !!site.wcpos_api_url,
				hasWpApiUrl: !!site.wp_api_url,
			},
		});
		requestStateManager.setAuthFailed(true);
		return null;
	}

	if (!apiUrl) {
		// The site can be transiently un-hydrated (e.g. after a web wake, before
		// wcpos_api_url / wp_api_url resolve). Treat as retryable — do NOT latch authFailed.
		tokenLogger.debug('Skipping token refresh - API URL unavailable', {
			context: {
				hasWcposApiUrl: !!site.wcpos_api_url,
				hasWpApiUrl: !!site.wp_api_url,
			},
		});
		return null;
	}

	try {
		await requestStateManager.startTokenRefresh(async () => {
			pauseQueue();
			try {
				// Rewrite only when wp_api_url can supply the REST root: apiUrl is a
				// namespace base (…/wcpos/v2/), and deriving a root from it would
				// strip the wrong segment and emit a malformed home URL.
				const pathUrl = `${apiUrl}auth/refresh`;
				const refreshUrl =
					site.wp_api_url && resolveRestTransport(site) === 'query'
						? toRestRouteUrl(pathUrl, deriveSyntheticPathRoot(site.wp_api_url))
						: pathUrl;
				const signaledRefreshUrl = new URL(refreshUrl);
				const useProtocolHeaders = site.use_protocol_headers ?? false;
				if (AppInfo.platform !== 'web' || !useProtocolHeaders) {
					signaledRefreshUrl.searchParams.set(PROTOCOL_QUERY_PARAM, String(SYNC_PROTOCOL_VERSION));
					signaledRefreshUrl.searchParams.set(
						CLIENT_QUERY_PARAM,
						formatClientSignal(AppInfo.platform, AppInfo.version)
					);
				}
				const response = await getHttpClient().post(
					signaledRefreshUrl.toString(),
					{ refresh_token: refreshToken },
					// The refresh POST is exactly the request class a blank/library UA
					// gets IP-banned for (B10) — stamp it like every other lane. The
					// fragment is empty on web, which keeps the browser UA.
					{
						headers: {
							'X-WCPOS': '1',
							...(AppInfo.platform !== 'web' || useProtocolHeaders
								? {
										[PROTOCOL_HEADER]: String(SYNC_PROTOCOL_VERSION),
										[CLIENT_HEADER]: formatClientSignal(AppInfo.platform, AppInfo.version),
									}
								: {}),
							...AppInfo.userAgentHeader,
						},
					}
				);

				const responseData = getResponseData(response);
				if (!isTokenRefreshResponse(responseData)) {
					throw new Error('REFRESH_TOKEN_INVALID');
				}

				const { access_token, expires_at } = responseData;
				await wpUser.incrementalPatch({ access_token, expires_at });
				// One lifecycle breadcrumb per refresh CYCLE (#899): this closure runs
				// only in the caller that actually drove the single-flight refresh
				// (startTokenRefresh coalesces the rest), so concurrent 401s across the
				// sync engine and the http client still produce exactly one info row.
				// The absorbed 401 attempts themselves are debug rows with
				// outcome 'recovered'; this is the positive ending the merchant reads.
				tokenLogger.info(sessionRenewedMessage ?? 'Session renewed automatically', {
					context: { userId: wpUser.id, siteUrl: site.url },
					terminal: {
						outcome: 'ok',
						operationType: 'auth.refresh',
						...(operationId !== undefined ? { operationId } : {}),
					},
				});
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
		// Level reflects the settled outcome (#899 rubric): a terminally rejected
		// refresh token means the user must re-authenticate → error; a transient
		// blip (5xx/network) will need attention only if it persists → warn.
		tokenLogger[terminal ? 'error' : 'warn']('Unable to refresh session', {
			code: terminal ? ERROR_CODES.SESSION_EXPIRED : ERROR_CODES.AUTH_UNEXPECTED,
			context: {
				error: error instanceof Error ? error.message : String(error),
				terminal,
				userId: wpUser.id,
				siteUrl: site.url,
			},
			terminal: {
				outcome: 'failed',
				operationType: 'auth.refresh',
				...(operationId !== undefined ? { operationId } : {}),
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
		const shaped = error as {
			status?: unknown;
			response?: { status?: unknown };
		};
		if (typeof shaped.status === 'number') return shaped.status;
		if (typeof shaped.response?.status === 'number') return shaped.response.status;
	}
	const message = error instanceof Error ? error.message : String(error);
	const match = /\b(\d{3})\b/.exec(message);
	return match ? Number(match[1]) : undefined;
}
