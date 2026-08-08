let lastResponseAt: number | null = null;
const subscribers = new Set<() => void>();

export function reportNetworkResponse(): void {
	lastResponseAt = Date.now();
	for (const subscriber of subscribers) {
		subscriber();
	}
}

export function lastNetworkResponseAt(): number | null {
	return lastResponseAt;
}

export function subscribeNetworkPulse(callback: () => void): () => void {
	subscribers.add(callback);
	return () => subscribers.delete(callback);
}
