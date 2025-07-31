import * as React from 'react';

import get from 'lodash/get';

import useHttpClient from '@wcpos/hooks/use-http-client';
import log from '@wcpos/utils/logger';

import { useT } from '../../../contexts/translations';
import { parseLinkHeader } from '../../../lib/url';

export type UrlDiscoveryStatus = 'idle' | 'discovering' | 'success' | 'error';

interface UseUrlDiscoveryReturn {
	status: UrlDiscoveryStatus;
	error: string | null;
	wpApiUrl: string | null;
	discoverWpApiUrl: (url: string) => Promise<string | null>;
}

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
		async (normalizedUrl: string): Promise<string | null> => {
			try {
				log.debug('Attempting Link header discovery for:', normalizedUrl);
				const response = await http.head(normalizedUrl);

				if (!response) {
					throw new Error(t('URL not found', { _tags: 'core' }));
				}

				const link = get(response, ['headers', 'link']);
				if (!link) {
					log.debug('Link header not found, will try fallback method');
					return null;
				}

				// Parse the link header
				const parsed = parseLinkHeader(link);
				const wpApiUrl = get(parsed, ['https://api.w.org/', 'url']);

				if (wpApiUrl) {
					log.debug('Successfully discovered wp-json URL from Link header:', wpApiUrl);
					return wpApiUrl;
				}

				return null;
			} catch (err) {
				log.debug('Link header discovery failed:', err.message);
				return null;
			}
		},
		[http, t]
	);

	/**
	 * Fallback method: try standard WordPress API path
	 */
	const tryFallbackDiscovery = React.useCallback(
		async (normalizedUrl: string): Promise<string | null> => {
			try {
				const fallbackUrl = `${normalizedUrl}/wp-json/`;
				log.debug('Attempting fallback discovery for:', fallbackUrl);

				// Just do a HEAD request to check if the endpoint exists
				const response = await http.head(fallbackUrl);

				if (response && response.status === 200) {
					log.debug('Successfully discovered wp-json URL via fallback:', fallbackUrl);
					return fallbackUrl;
				}

				return null;
			} catch (err) {
				log.debug('Fallback discovery failed:', err.message);
				return null;
			}
		},
		[http]
	);

	/**
	 * Main discovery function
	 */
	const discoverWpApiUrl = React.useCallback(
		async (url: string): Promise<string | null> => {
			if (!url || url.trim() === '') {
				setError(t('URL is required', { _tags: 'core' }));
				return null;
			}

			setStatus('discovering');
			setError(null);
			setWpApiUrl(null);

			try {
				const normalizedUrl = normalizeUrl(url);
				log.debug('Starting URL discovery for:', normalizedUrl);

				// Step 1: Try Link header discovery
				let discoveredUrl = await tryLinkHeaderDiscovery(normalizedUrl);

				// Step 2: If Link header failed, try fallback
				if (!discoveredUrl) {
					log.debug('Link header discovery failed, trying fallback method');
					discoveredUrl = await tryFallbackDiscovery(normalizedUrl);
				}

				if (!discoveredUrl) {
					throw new Error(t('Site does not seem to be a WordPress site', { _tags: 'core' }));
				}

				setWpApiUrl(discoveredUrl);
				setStatus('success');
				log.debug('URL discovery completed successfully:', discoveredUrl);
				return discoveredUrl;
			} catch (err) {
				const errorMessage =
					err.message || t('Failed to discover WordPress API', { _tags: 'core' });
				setError(errorMessage);
				setStatus('error');
				log.error('URL discovery failed:', errorMessage);
				return null;
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
