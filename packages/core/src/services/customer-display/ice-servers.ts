/** One ICE server entry; the subset of the DOM RTCIceServer shape both runtimes accept. */
export interface IceServer {
	urls: string | string[];
	username?: string;
	credential?: string;
}

/**
 * Public STUN servers for the POS → customer display link.
 * Without STUN each peer offers only mDNS `.local` host candidates, which fail when the
 * network blocks multicast between clients. STUN adds the server-reflexive candidate.
 * STUN sees only the till's public address; no display data passes through it.
 * Two operators, so one outage does not cost the candidate.
 * Matches the Pro default in contract v1; the store advertisement's `iceServers` replaces it.
 */
export const DEFAULT_ICE_SERVERS: IceServer[] = [
	{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
];

export function parseIceServers(value: unknown): IceServer[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const servers: IceServer[] = [];
	for (const entry of value) {
		if (!entry || typeof entry !== 'object') return undefined;
		const { urls, username, credential } = entry;
		if (
			!(typeof urls === 'string' && urls.length > 0) &&
			!(
				Array.isArray(urls) &&
				urls.length > 0 &&
				urls.every((url) => typeof url === 'string' && url.length > 0)
			)
		)
			return undefined;
		if ('username' in entry && typeof username !== 'string') return undefined;
		if ('credential' in entry && typeof credential !== 'string') return undefined;
		servers.push({
			urls,
			...(typeof username === 'string' ? { username } : {}),
			...(typeof credential === 'string' ? { credential } : {}),
		});
	}
	return servers;
}
