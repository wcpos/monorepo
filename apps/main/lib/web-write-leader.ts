/**
 * Elect one browser tab to own the sync engine's write plane. The exclusive
 * Web Lock stays held until disposal; the browser releases it automatically if
 * the tab dies, allowing the next waiting tab to take over.
 */
export function electWriteLeader(lockName: string): {
	isLeader: () => boolean;
	dispose: () => void;
} {
	let leader = false;
	let disposed = false;
	let release: () => void = () => undefined;
	const lifetime = new Promise<void>((resolve) => {
		release = resolve;
	});
	const locks = globalThis.navigator?.locks;

	if (locks === undefined) {
		// The host disables multiInstance in this fallback, preserving the former
		// single-tab assumption rather than risking two unfenced writers.
		leader = true;
	} else {
		void locks
			.request(lockName, { mode: 'exclusive' }, async () => {
				if (disposed) return;
				leader = true;
				try {
					await lifetime;
				} finally {
					leader = false;
				}
			})
			.catch(() => {
				// A failed lock request must never promote this tab without exclusion.
				leader = false;
			});
	}

	return {
		isLeader: () => leader,
		dispose: () => {
			disposed = true;
			leader = false;
			release();
		},
	};
}
