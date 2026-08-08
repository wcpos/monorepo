const lastResponseAtBySite = new Map<string, number>();
const subscribersBySite = new Map<string, Set<() => void>>();

function canonicalSite(site: string): string {
	return site
		.replace(/^https?:\/\//i, '')
		.replace(/\/+$/, '')
		.toLowerCase();
}

export function reportNetworkResponse(site: string, at = Date.now()): void {
	const key = canonicalSite(site);
	lastResponseAtBySite.set(key, at);
	for (const subscriber of subscribersBySite.get(key) ?? []) {
		subscriber();
	}
}

export function lastNetworkResponseAt(site: string): number | null {
	return lastResponseAtBySite.get(canonicalSite(site)) ?? null;
}

export function subscribeNetworkPulse(site: string, callback: () => void): () => void {
	const key = canonicalSite(site);
	const subscribers = subscribersBySite.get(key) ?? new Set<() => void>();
	subscribers.add(callback);
	subscribersBySite.set(key, subscribers);
	return () => subscribers.delete(callback);
}
