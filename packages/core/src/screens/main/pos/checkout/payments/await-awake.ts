// A backstop against a wake signal that never clears the sleeping block: a real hidden tab
// waits in `awaitWake` and never spins (POS-34N).
export const RECORD_ASLEEP_RESEND_LIMIT = 10;

/** Resolves at once when the app is awake, else on the manager's first wake callback. */
export function awaitAwake(manager: {
	isAppSleeping(): boolean;
	onWake(cb: () => void): () => void;
}): Promise<void> {
	if (!manager.isAppSleeping()) return Promise.resolve();
	return new Promise((resolve) => {
		const unsubscribe = manager.onWake(() => {
			unsubscribe();
			resolve();
		});
	});
}
