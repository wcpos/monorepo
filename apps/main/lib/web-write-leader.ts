/**
 * Elect one browser tab to own the sync engine's write plane. The exclusive
 * Web Lock stays held until disposal; the browser releases it automatically if
 * the tab dies, allowing the next waiting tab to take over.
 *
 * `onUnavailable` fires when Web Locks cannot arbitrate — the API is absent, or
 * a `request()` is rejected (sandboxed iframe, opaque origin, restricted
 * WebView). In that case this tab MUST still own its write plane: a follower
 * that can never lead would enqueue sales that never drain, silently. So the
 * tab falls back to single-writer (`leader = true`) and the host surfaces a
 * degraded diagnostic. A lone such tab is correct; two of them are a rare,
 * now-visible degrade — never a silent no-sync.
 */
export function electWriteLeader(
	lockName: string,
	options: { onUnavailable?: () => void } = {}
): {
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

	// Web Locks cannot arbitrate: own the write plane rather than strand this tab
	// as a follower that never drains.
	const degradeToSingleWriter = () => {
		if (disposed) return;
		leader = true;
		options.onUnavailable?.();
	};

	if (locks === undefined) {
		degradeToSingleWriter();
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
				// A rejected request means Web Locks are unavailable in this context —
				// degrade to single-writer, never leave the tab a silent follower.
				degradeToSingleWriter();
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
