const lastResponseAtBySite = new Map<string, number>();
const subscribersBySite = new Map<string, Set<() => void>>();

function canonicalSite(site: string): string {
	const normalized = site.toLowerCase();
	let start = 0;
	if (normalized.startsWith('https://')) start = 8;
	else if (normalized.startsWith('http://')) start = 7;
	let end = normalized.length;
	while (end > start && normalized[end - 1] === '/') end -= 1;
	return normalized.slice(start, end);
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
