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

async function readWithConsensus(): Promise<string | undefined> {
	if (typeof BroadcastChannel === 'undefined') return readOrMint();
	let channel: BroadcastChannel | undefined;
	try {
		channel = new BroadcastChannel('wcpos-instance-id');
		let candidate = readOrMint();
		if (!candidate) return undefined;
		channel.onmessage = ({ data }: MessageEvent<unknown>) => {
			if (typeof data !== 'string' || !data || data === candidate) return;
			candidate = candidate! < data ? candidate : data;
			channel!.postMessage(candidate);
		};
		channel.postMessage(candidate);
		await new Promise((resolve) => setTimeout(resolve, 50));
		const stored = window.localStorage.getItem('wcpos_instance_id');
		if (stored && stored < candidate) candidate = stored;
		window.localStorage.setItem('wcpos_instance_id', candidate);
		return candidate;
	} catch {
		return readOrMint();
	} finally {
		channel?.close();
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
				: await readWithConsensus();
	} catch {
		// Rejected Web Locks are unavailable; use the same path as absent locks.
		cached = await readWithConsensus();
	}
	return cached;
}
