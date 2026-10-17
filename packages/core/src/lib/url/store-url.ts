/** Convert a non-ASCII hostname to punycode, keeping userinfo and port verbatim. */
export function asciiHost(host: string): string {
	if (/^[\x00-\x7F]*$/.test(host)) return host;
	try {
		const match = host.match(/^(.*@)?(\[[^\]]*\]|[^:]*)(:.*)?$/);
		if (!match) return host;
		const [, userinfo = '', hostname, port = ''] = match;
		if (/^[\x00-\x7F]*$/.test(hostname)) return host;
		return `${userinfo}${new URL(`https://${hostname}`).hostname}${port}`;
	} catch {
		return host;
	}
}

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
