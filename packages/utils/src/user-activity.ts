let lastActivityMs = 0;
const listeners = new Set<() => void>();

export function markUserActivity(nowMs: number = Date.now()): void {
	lastActivityMs = nowMs;
	for (const listener of [...listeners]) {
		try {
			listener();
		} catch {
			// A throwing listener must not block activity tracking or other listeners.
		}
	}
}

export function lastUserActivityMs(): number {
	return lastActivityMs;
}

export function onUserActivity(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
