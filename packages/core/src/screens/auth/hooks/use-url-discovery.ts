import * as React from 'react';

import get from 'lodash/get';

import { useHttpClient } from '@wcpos/hooks/use-http-client';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../contexts/translations';
import { parseLinkHeader } from '../../../lib/url';

const discoveryLogger = getLogger(['wcpos', 'auth', 'discovery']);

export type UrlDiscoveryStatus = 'idle' | 'discovering' | 'success' | 'error';

/**
 * The root probe hits the site's front page — the heaviest request a WordPress
 * server serves. On a starved server it can hang with NO response at all
 * (observed on dev-next 2026-08-11, monorepo#1155: the HEAD never returned
 * while /wp-json/ still answered in seconds), and an unbounded request leaves
 * the cashier staring at an infinite Connect spinner with no error and no
 * fallback. Matches the 10s auth/test timeout in use-auth-testing.
 */
const DISCOVERY_PROBE_TIMEOUT_MS = 10_000;

interface ProbeResult {
	url: string | null;
	timedOut: boolean;
}

/**
 * Axios reports a request that hit `timeout` as ECONNABORTED (ETIMEDOUT from
 * some Node adapters). Distinguished so the cashier sees "took too long", not
 * "not a WordPress site".
 */
const isTimeoutError = (err: unknown): boolean => {
	const code = get(err, ['code']);
	return code === 'ECONNABORTED' || code === 'ETIMEDOUT';
};

interface UseUrlDiscoveryReturn {
	status: UrlDiscoveryStatus;
	error: string | null;
	wpApiUrl: string | null;
	discoverWpApiUrl: (url: string) => Promise<string>;
}

/**
 * Extract wp-json URL from a Link header string
 */
const extractWpApiUrlFromLink = (link: string | undefined): string | null => {
	if (!link) return null;
	const parsed = parseLinkHeader(link);
	return get(parsed, ['https://api.w.org/', 'url']) || null;
};

/**
 * Check if an Axios error response looks like the WordPress REST API.
 * HEAD responses have no body, so we check status + content-type header.
 * A 401/403 from /wp-json/ with content-type application/json is the WP REST API
 * (e.g. Force Login plugin blocking unauthenticated access).
 */
const isWpRestApiError = (err: unknown): boolean => {
	const status = get(err, ['response', 'status']);
	if (status !== 401 && status !== 403) return false;

	const contentType: unknown = get(err, ['response', 'headers', 'content-type']);
	return typeof contentType === 'string' && contentType.includes('application/json');
};

/**
 * Hook for discovering WordPress API URL from a given site URL
 * Tries Link header first, falls back to /wp-json if Link header is blocked
 */
export const useUrlDiscovery = (): UseUrlDiscoveryReturn => {
	const [status, setStatus] = React.useState<UrlDiscoveryStatus>('idle');
	const [error, setError] = React.useState<string | null>(null);
	const [wpApiUrl, setWpApiUrl] = React.useState<string | null>(null);
	const http = useHttpClient();
	const t = useT();

	/**
	 * Clean and normalize the input URL
	 */
	const normalizeUrl = React.useCallback((url: string): string => {
		const protocol = 'https'; // Always use HTTPS for security
		const urlWithoutProtocol = url.replace(/^.*:\/{2,}|\s|\/+$/g, '') || '';
		return `${protocol}://${urlWithoutProtocol}`;
	}, []);

	/**
	 * Try to discover wp-json URL from Link header
	 */
	const tryLinkHeaderDiscovery = React.useCallback(
		async (normalizedUrl: string): Promise<ProbeResult> => {
			try {
				const response = await http.head(normalizedUrl, { timeout: DISCOVERY_PROBE_TIMEOUT_MS });

				if (!response) {
					return { url: null, timedOut: false };
				}

				return {
					url: extractWpApiUrlFromLink(get(response, ['headers', 'link'])),
					timedOut: false,
				};
			} catch (err: unknown) {
				// Check error response headers for Link header
				const link = get(err, ['response', 'headers', 'link']);
				return { url: extractWpApiUrlFromLink(link), timedOut: isTimeoutError(err) };
			}
		},
		[http]
	);

	/**
	 * Fallback method: try standard WordPress API path
	 * A 401/403 with a WP REST API error body proves the REST API exists
	 */
	const tryFallbackDiscovery = React.useCallback(
		async (normalizedUrl: string): Promise<ProbeResult> => {
			const fallbackUrl = `${normalizedUrl}/wp-json/`;

			try {
				const response = await http.head(fallbackUrl, { timeout: DISCOVERY_PROBE_TIMEOUT_MS });

				if (response && response.status === 200) {
					return { url: fallbackUrl, timedOut: false };
				}

				return { url: null, timedOut: false };
			} catch (err: unknown) {
				// A WP REST API error (e.g. rest_unauthorized) proves the endpoint exists
				if (isWpRestApiError(err)) {
					return { url: fallbackUrl, timedOut: false };
				}

				return { url: null, timedOut: isTimeoutError(err) };
			}
		},
		[http]
	);

	/**
	 * Main discovery function
	 */
	const discoverWpApiUrl = React.useCallback(
		async (url: string): Promise<string> => {
			if (!url || url.trim() === '') {
				const errorMsg = t('auth.url_is_required');
				discoveryLogger.error(errorMsg, {
					showToast: true,
					code: ERROR_CODES.STORE_URL_INVALID,
				});
				setError(errorMsg);
				throw new Error(errorMsg);
			}

			setStatus('discovering');
			setError(null);
			setWpApiUrl(null);

			try {
				const normalizedUrl = normalizeUrl(url);

				// Step 1: Try Link header discovery
				const linkProbe = await tryLinkHeaderDiscovery(normalizedUrl);
				let discoveredUrl = linkProbe.url;
				let timedOut = linkProbe.timedOut;

				// Step 2: If Link header failed, try fallback
				if (!discoveredUrl) {
					const fallbackProbe = await tryFallbackDiscovery(normalizedUrl);
					discoveredUrl = fallbackProbe.url;
					timedOut = timedOut || fallbackProbe.timedOut;
				}

				if (!discoveredUrl) {
					throw new Error(
						timedOut ? t('auth.site_took_too_long_to_respond') : t('auth.site_does_not_seem_to_be')
					);
				}

				setWpApiUrl(discoveredUrl);
				setStatus('success');
				discoveryLogger.debug(`WordPress API URL discovered: ${discoveredUrl}`);
				return discoveredUrl;
			} catch (err) {
				const errorMessage =
					err instanceof Error ? err.message : t('auth.failed_to_discover_wordpress_api');
				setError(errorMessage);
				setStatus('error');
				throw err;
			}
		},
		[normalizeUrl, tryLinkHeaderDiscovery, tryFallbackDiscovery, t]
	);

	return {
		status,
		error,
		wpApiUrl,
		discoverWpApiUrl,
	};
};
