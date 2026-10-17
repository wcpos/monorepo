/** Convert a non-ASCII host to punycode, preserving ASCII and unparsable hosts. */
export function asciiHost(host: string): string {
	if (/^[\x00-\x7F]*$/.test(host)) return host;
	try {
		return new URL(`https://${host}`).host;
	} catch {
		return host;
	}
}

/** Normalize a store URL as before, converting only its non-ASCII host. */
export function normalizeStoreUrl(url: string): string {
	const protocol = 'https'; // Always use HTTPS for security
	const urlWithoutProtocol = url.replace(/^.*:\/{2,}|\s|\/+$/g, '') || '';
	return `${protocol}://${urlWithoutProtocol}`.replace(
		/^https:\/\/([^/?#]+)/,
		(_, host: string) => `https://${asciiHost(host)}`
	);
}
