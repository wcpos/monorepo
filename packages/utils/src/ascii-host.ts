/** Convert a non-ASCII hostname to punycode, keeping userinfo and port verbatim. */
export function asciiHost(host: string): string {
	if (/^[\x00-\x7F]*$/.test(host)) return host;
	try {
		// Userinfo ends at the LAST `@`; a bracketed host runs to its `]` (then a port or
		// nothing), otherwise the host runs to the first `:`. A linear split rather than the
		// regex it replaced, which CodeQL flagged as polynomial on library input (#2706).
		const at = host.lastIndexOf('@');
		const userinfo = at === -1 ? '' : host.slice(0, at + 1);
		const rest = host.slice(at + 1);
		let hostname: string;
		let port: string;
		const close = rest.startsWith('[') ? rest.indexOf(']') : -1;
		if (close !== -1 && (close === rest.length - 1 || rest.charAt(close + 1) === ':')) {
			hostname = rest.slice(0, close + 1);
			port = rest.slice(close + 1);
		} else {
			const colon = rest.indexOf(':');
			hostname = colon === -1 ? rest : rest.slice(0, colon);
			port = colon === -1 ? '' : rest.slice(colon);
		}
		if (/^[\x00-\x7F]*$/.test(hostname)) return host;
		return `${userinfo}${new URL(`https://${hostname}`).hostname}${port}`;
	} catch {
		return host;
	}
}
