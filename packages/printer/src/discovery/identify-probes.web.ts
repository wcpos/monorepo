import { type IdentifyProbes } from './identify';
import { fetchStar, postEposFetch } from './identify-probes-fetch';
export function createIdentifyProbes(): IdentifyProbes {
	return {
		postEpos: (host, port, path, xml, timeoutMs) =>
			postEposFetch(host, port, path, xml, timeoutMs, true),
		fetchStar,
	};
}
