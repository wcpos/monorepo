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
