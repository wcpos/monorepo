/**
 * Run `update` so every state update inside it lands in ONE render, whoever calls it (see the
 * batching invariant at `useBrowsePath`'s `enter`). Native has no public `flushSync`: the
 * gesture handler's JS callback is relied on to batch (unverified on device); the web variant
 * forces it.
 */
export function inOneBatch(update: () => void): void {
	update();
}
