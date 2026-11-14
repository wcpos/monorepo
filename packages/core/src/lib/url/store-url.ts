import { asciiHost } from '@wcpos/utils/ascii-host';

export { asciiHost };

/** Convert only the authority's non-ASCII hostname in an absolute URL. */
export function withAsciiHost(url: string): string {
	return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)([^/?#\\]+)/i, (_, scheme, authority) => {
		return `${scheme}${asciiHost(authority)}`;
	});
}

/** Normalize a store URL as before, converting only its non-ASCII host. */
export function normalizeStoreUrl(url: string): string {
	const protocol = 'https'; // Always use HTTPS for security
	const urlWithoutProtocol = url.replace(/^.*:\/{2,}|\s|\/+$/g, '') || '';
	return withAsciiHost(`${protocol}://${urlWithoutProtocol}`);
}
