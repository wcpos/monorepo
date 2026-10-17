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
		let candidate = readOrMint();
		if (!candidate) return undefined;
		channel = new BroadcastChannel('wcpos-instance-id');
		const nonce = Math.random().toString(36);
		const peers = new Map<string, boolean>();
		let windowClosed = false;
		return await new Promise<string | undefined>((resolve, reject) => {
			const announce = () => channel!.postMessage({ candidate, nonce });
			const finish = () => {
				if (!windowClosed || [...peers.values()].some((acked) => !acked)) return;
				try {
					const stored = window.localStorage.getItem('wcpos_instance_id');
					if (stored && stored < candidate!) candidate = stored;
					window.localStorage.setItem('wcpos_instance_id', candidate!);
					// Keep listening after returning: late peers can still lower the winner.
					cached = candidate;
					resolve(candidate);
				} catch (error) {
					reject(error);
				}
			};
			channel!.onmessage = ({
				data,
			}: MessageEvent<{ nonce: string; candidate?: string; winner?: string; ack?: string }>) => {
				if (!data || typeof data.nonce !== 'string' || data.nonce === nonce) return;
				const winner = data.candidate ?? data.winner;
				if (typeof winner !== 'string' || !winner) return;
				if (winner < candidate!) candidate = winner;
				if (cached !== undefined) cached = candidate;
				if (data.ack === nonce) peers.set(data.nonce, true);
				if (data.candidate) {
					if (!peers.has(data.nonce)) {
						peers.set(data.nonce, false);
						announce();
					}
					channel!.postMessage({ ack: data.nonce, winner: candidate, nonce });
				}
				finish();
			};
			announce();
			setTimeout(() => {
				windowClosed = true;
				finish();
			}, 50);
		});
	} catch {
		channel?.close();
		return readOrMint();
	}
}

let cached: string | undefined;
let pending: Promise<string | undefined> | undefined;

export async function getInstanceId(): Promise<string | undefined> {
	if (cached !== undefined) return cached;
	return (pending ??= readInstanceId());
}

async function readInstanceId(): Promise<string | undefined> {
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
	pending = undefined;
	return cached;
}
