/**
 * Web and Electron: the instance id lives in localStorage under its own key, separate from
 * the telemetry install id that consent denial removes. Undefined when storage is missing
 * or blocked; the header is then omitted.
 */
function readOrMint(): string | undefined {
	if (typeof window === 'undefined') return undefined;
	try {
		const stored = window.localStorage.getItem('wcpos_instance_id');
		if (stored) return stored;
		const id = window.crypto.randomUUID();
		window.localStorage.setItem('wcpos_instance_id', id);
		return window.localStorage.getItem('wcpos_instance_id') ?? undefined;
	} catch {
		return undefined;
	}
}

let cached: string | undefined;

export async function getInstanceId(): Promise<string | undefined> {
	if (cached !== undefined) return cached;
	try {
		// Minted once per process; the lock only matters for the first read of each tab.
		cached =
			typeof navigator !== 'undefined' && navigator.locks
				? await navigator.locks.request('wcpos-instance-id', readOrMint)
				: readOrMint();
	} catch {
		// Rejected Web Locks are unavailable; use the same path as absent locks.
		cached = readOrMint();
	}
	return cached;
}
