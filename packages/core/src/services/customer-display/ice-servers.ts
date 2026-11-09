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
 */
export const DEFAULT_ICE_SERVERS: IceServer[] = [
	{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
	{ urls: 'stun:stun.cloudflare.com:3478' },
];
