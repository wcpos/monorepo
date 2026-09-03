import { type IdentifyProbes } from './identify';
import { fetchStar, postEposFetch } from './identify-probes-fetch';
export function createIdentifyProbes(): IdentifyProbes {
	return {
		// network-adapter.web.ts prints through the vendor HTTP endpoints; browsers have no sockets.
		printableLanes: new Set(['epos-print', 'webprnt']),
		postEpos: (host, port, path, xml, timeoutMs) =>
			postEposFetch(host, port, path, xml, timeoutMs, true),
		fetchStar,
	};
}
