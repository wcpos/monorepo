/**
 * Chunk-and-yield discipline for the engine's heavy walks (#949 tranche 2, ruling R10b).
 *
 * 1.9 shipped this as `packages/query/src/yield.ts` and pinned it with a p95-event-loop-delay
 * contract during heavy sync. The rewrite dropped it: PR #1006 measured the existence reconcile
 * performing ZERO macrotask yields — the entire audit is one unbroken block, so a cashier
 * mid-sale feels the app freeze while a big store syncs. This restores the discipline.
 *
 * `await` alone does NOT help: a promise that resolves from an in-memory storage settles on the
 * MICROtask queue, which drains before the event loop ever gets to render, dispatch a tap, or run
 * a timer. Only a macrotask boundary gives the UI a turn — hence an explicit yield.
 */

declare const scheduler: { yield?: () => Promise<void> } | undefined;

/**
 * True on React Native (Hermes). RN sets `navigator = {product: 'ReactNative'}` during startup
 * (`react-native/Libraries/Core/setUpNavigator.js`), which is the only reliable host signal
 * available before any native module is touched.
 */
function isReactNative(): boolean {
	return typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
}

/** True on Node (the vitest/CI host), where `setImmediate` is a genuine check-phase task. */
function isNode(): boolean {
	return (
		typeof process !== 'undefined' && typeof process.versions?.node === 'string' && !isReactNative()
	);
}

/**
 * A macrotask hop, chosen once for the host.
 *
 * Two traps drive this order, and both were found by adversarial review rather than by reasoning
 * from the API names:
 *
 *  - **React Native's `setImmediate` is NOT a macrotask.** It is shimmed straight onto
 *    `queueMicrotask` (`react-native/Libraries/Core/Timers/immediateShim.js`), so on the POS's
 *    primary host it would yield to nothing at all and every walk below would still freeze the
 *    UI. `setImmediate` is therefore gated to Node.
 *  - **`setTimeout` is clamped to >=1000 ms in a backgrounded browser tab.** A 51-bucket audit
 *    yielding through it would stretch from ~260 ms to about a minute, so on the web it is the
 *    last resort, behind `MessageChannel`.
 *
 * Resulting order:
 *  1. `scheduler.yield()` — Chromium 115+. Purpose-built: the continuation is re-queued AHEAD of
 *                           other tasks, so yielding costs latency, not throughput.
 *  2. `setImmediate`      — NODE ONLY. Real check-phase task, and unlike an unref'd MessagePort it
 *                           cannot let the process exit with a hop still in flight.
 *  3. `MessageChannel`    — Safari, Firefox, Web Workers. Unclamped, and the primitive React's own
 *                           scheduler uses for exactly this reason.
 *  4. `setTimeout(0)`     — React Native (a real native-timer task there, and RN defines no
 *                           MessageChannel), plus any host that reaches none of the above.
 */
function selectMacrotaskHop(): () => Promise<void> {
	if (typeof scheduler !== 'undefined' && typeof scheduler?.yield === 'function') {
		return () => scheduler!.yield!();
	}

	if (isNode() && typeof setImmediate === 'function') {
		return () => new Promise<void>((resolve) => void setImmediate(resolve));
	}

	if (!isReactNative() && typeof MessageChannel === 'function') {
		return createMessageChannelHop();
	}

	return () => new Promise<void>((resolve) => void setTimeout(resolve, 0));
}

/**
 * The `MessageChannel` hop. Exported so the concurrency property below can be tested directly —
 * the branch is otherwise unreachable under the node test host, which takes `setImmediate`.
 */
export function createMessageChannelHop(): () => Promise<void> {
	const channel = new MessageChannel();
	// Node's MessagePort keeps the loop alive; browsers have no unref(), hence the optional call.
	(channel.port1 as { unref?: () => void }).unref?.();
	(channel.port2 as { unref?: () => void }).unref?.();
	// A FIFO queue, NOT a single slot: three reconcile ports walk concurrently, so overlapping hops
	// are the norm. A single `resolveHop` would be overwritten by the later caller and the earlier
	// promise would never settle — a permanently hung walk. Port messages are delivered in order
	// (HTML spec), so one shift per message pairs each hop with its own resolver.
	const pending: (() => void)[] = [];
	channel.port1.onmessage = () => {
		pending.shift()?.();
	};
	return () =>
		new Promise<void>((resolve) => {
			pending.push(resolve);
			channel.port2.postMessage(null);
		});
}

let macrotaskHop: (() => Promise<void>) | undefined;

/**
 * Hand the event loop a turn: render a frame, deliver the cashier's tap, fire a pending timer.
 * Resolves on the next macrotask.
 */
export function yieldToEventLoop(): Promise<void> {
	macrotaskHop ??= selectMacrotaskHop();
	return macrotaskHop();
}

/** Test seam: forget the host choice so a suite can exercise a different branch. */
export function resetMacrotaskHopForTesting(): void {
	macrotaskHop = undefined;
}

/**
 * Walk `items` in place, yielding to the event loop every `chunkSize` items.
 *
 * Index-based rather than slice-based (1.9 sliced): these walks run over tens of thousands of
 * live RxDocuments, and allocating a copy of every chunk is pure overhead for a read-only pass.
 *
 * The yield lands BETWEEN items, never inside `visit`, so a caller whose per-item work must stay
 * atomic keeps that guarantee. There is no trailing yield: the last chunk hands control back to
 * the caller directly.
 */
export async function forEachYielding<T>(
	items: readonly T[],
	chunkSize: number,
	visit: (item: T, index: number) => void
): Promise<void> {
	// Integer-only: a fractional size makes the `index % chunkSize` boundary meaningless (it would
	// never be 0 after the first item), so it is rejected rather than silently never yielding.
	if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
		throw new RangeError('chunkSize must be a positive integer');
	}
	for (let index = 0; index < items.length; index += 1) {
		if (index > 0 && index % chunkSize === 0) {
			await yieldToEventLoop();
		}
		visit(items[index] as T, index);
	}
}
