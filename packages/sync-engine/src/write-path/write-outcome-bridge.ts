import type { WriteAnnihilatedEvent, WriteOutcomeEvent } from './write-drain-lane';

/**
 * THE CROSS-TAB WRITE-OUTCOME BRIDGE (#1209).
 *
 * Web multi-tab is a first-class topology, and since #1057 exactly one tab owns
 * the write plane: a FOLLOWER tab still enqueues writes, but its drain tick is a
 * no-op and the leader is the only process that ever pushes. Engine events,
 * however, were in-process only — `emitEngineEvent` walks a local subscriber set
 * — so `awaitWriteOutcome` in a follower waited on an event that could only ever
 * fire in the leader's window. Every outcome-dependent behaviour therefore
 * degraded to optimistic-only off-leader: #866's refused-delete →
 * `convertToPending()` fallback was structurally unreachable, `void.tsx` showed
 * "Order removed" for an order the store had refused to delete, and the
 * money-divergence alert (#1033) never reached the tab the cashier was looking
 * at. That is a feedback gap, not a data-integrity one — the leader performed
 * every write correctly — but a refusal the cashier cannot see is not a handled
 * state.
 *
 * WHAT THIS IS. Feedback plumbing, and nothing more. The leader remains the ONLY
 * writer: nothing here pushes, drains, resolves, or mutates a queue row. Each
 * write outcome the leader emits locally is also posted on a BroadcastChannel
 * named for the scope database, and every peer engine re-emits what it receives
 * to its own subscribers — so a follower's `awaitWriteOutcome` (which matches on
 * `mutationId` alone) settles with the leader's real answer instead of timing
 * out.
 *
 * WHY RECEIVED EVENTS BYPASS `emitWriteEvent`. The engine's write-event funnel
 * carries a side effect: #1082's auto-revert calls `writePlane.resolveConflict`
 * on a rejected catalog write. That must run exactly once, in the leader — a
 * follower's `resolveConflict` refuses outright (`WritePlaneFollowerError`). So a
 * bridged event goes straight to `emitEngineEvent` (the subscriber fan-out) and
 * never back through the funnel, which also makes an echo loop impossible: a
 * received event is never re-published.
 *
 * SCOPE + VERSION SAFETY. The channel name carries the scope database name, so
 * two stores open in two tabs never cross-talk, and the bridge is re-pointed on a
 * scope switch exactly as the write lock is. Messages carry an envelope version
 * and are validated before they are believed: two tabs can be running different
 * builds (one reloaded, one not), and an unrecognised message is dropped rather
 * than emitted into the engine's closed event union.
 */

/** The write outcomes that cross tabs — the drain's outcome union plus the write
 * plane's one LOCAL terminal event, `write-annihilated` (#1059 cancels a
 * never-pushed create→delete chain on the LEADER, so the follower that asked for
 * the void needs to be told). Structurally identical to what `events()` emits;
 * `awaitWriteOutcome` matches on `mutationId` alone, so the id must survive the
 * hop verbatim. */
export type BroadcastWriteOutcome = WriteOutcomeEvent | WriteAnnihilatedEvent;

/** The engine-facing port. The engine neither opens nor names a channel — it
 * publishes what it produced and re-emits what a peer produced. */
export type WriteOutcomeBridge = {
	/** Announce an outcome THIS instance produced to peer instances. */
	publish(event: BroadcastWriteOutcome): void;
	/** Observe outcomes peers produced. Never receives this instance's own. */
	subscribe(listener: (event: BroadcastWriteOutcome) => void): () => void;
};

/** The minimal slice of `BroadcastChannel` this module uses — injectable so the
 * bridge is testable without a DOM and without a real channel. */
export type WriteOutcomeChannel = {
	postMessage(data: unknown): void;
	onmessage: ((event: { data: unknown }) => void) | null;
	close(): void;
};

/** Mirrors the write lock's `wcpos-write-leader:${databaseName}` convention, so
 * ownership and outcome feedback are namespaced by the same key. */
export function writeOutcomeChannelName(databaseName: string): string {
	return `wcpos-write-outcomes:${databaseName}`;
}

/**
 * Envelope version. Bump ONLY on a breaking change to the payload shape: a tab
 * running an older build drops envelopes it does not recognise, which costs that
 * tab its outcome feedback (it falls back to today's timeout) but can never feed
 * it a message it would misread.
 */
const ENVELOPE_VERSION = 1;

type Envelope = { wcpos: 'write-outcome'; v: number; event: unknown };

const BROADCAST_TYPES = new Set<BroadcastWriteOutcome['type']>([
	'write-acknowledged',
	'write-ack-rematerialized',
	'write-annihilated',
	'write-conflict',
	'write-rejected',
	'order-money-divergence',
]);

const isString = (value: unknown): value is string => typeof value === 'string';

/**
 * Believe a peer's message only when it is unambiguously one of ours, at a
 * version we understand, naming a type in the closed union with the three
 * identity fields every consumer indexes on. Returns null for anything else —
 * an unrelated channel message, a future build's event, a truncated payload.
 */
export function parseWriteOutcomeEnvelope(data: unknown): BroadcastWriteOutcome | null {
	if (typeof data !== 'object' || data === null) return null;
	const envelope = data as Partial<Envelope>;
	if (envelope.wcpos !== 'write-outcome' || envelope.v !== ENVELOPE_VERSION) return null;
	const event = envelope.event;
	if (typeof event !== 'object' || event === null) return null;
	const candidate = event as {
		type?: unknown;
		collection?: unknown;
		recordId?: unknown;
		mutationId?: unknown;
	};
	if (
		!isString(candidate.type) ||
		!BROADCAST_TYPES.has(candidate.type as BroadcastWriteOutcome['type'])
	) {
		return null;
	}
	if (
		!isString(candidate.collection) ||
		!isString(candidate.recordId) ||
		!isString(candidate.mutationId)
	) {
		return null;
	}
	return event as BroadcastWriteOutcome;
}

const defaultOpenChannel = (name: string): WriteOutcomeChannel | null => {
	// Absent on react-native and in jsdom. A host without BroadcastChannel is
	// single-window by construction (native, Electron) or has already degraded to
	// single-writer, so a null channel is the correct no-op — never an error.
	if (typeof BroadcastChannel === 'undefined') return null;
	try {
		return new BroadcastChannel(name) as unknown as WriteOutcomeChannel;
	} catch {
		return null;
	}
};

export type ScopedWriteOutcomeBridge = WriteOutcomeBridge & {
	/** Re-point the bridge at another scope's channel (a store switch), keeping
	 * every subscriber attached. `null` detaches without closing the bridge. */
	moveTo(channelName: string | null): void;
	close(): void;
};

/**
 * A bridge whose underlying channel can be swapped without disturbing
 * subscribers — the engine subscribes once, at construction, while the host
 * re-points the channel on every scope switch (the same lifecycle the write lock
 * already has).
 */
export function createWriteOutcomeBridge(
	options: {
		openChannel?: (name: string) => WriteOutcomeChannel | null;
		/** Called when a peer message could not be believed — build skew, or
		 * another feature sharing the channel name. Diagnostics only. */
		onUnreadableMessage?: () => void;
	} = {}
): ScopedWriteOutcomeBridge {
	const openChannel = options.openChannel ?? defaultOpenChannel;
	const listeners = new Set<(event: BroadcastWriteOutcome) => void>();
	let channel: WriteOutcomeChannel | null = null;
	let closed = false;

	const detach = (): void => {
		if (!channel) return;
		channel.onmessage = null;
		try {
			channel.close();
		} catch {
			// A channel whose window is already tearing down; nothing to salvage.
		}
		channel = null;
	};

	return {
		publish: (event) => {
			if (closed || !channel) return;
			try {
				channel.postMessage({
					wcpos: 'write-outcome',
					v: ENVELOPE_VERSION,
					event,
				} satisfies Envelope);
			} catch {
				// A closing window, or a payload the structured clone algorithm
				// refuses. Feedback is best-effort by design: the LOCAL emit already
				// happened and the write itself is unaffected — the peer falls back to
				// the pre-#1209 timeout rather than the engine throwing on a write.
			}
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		moveTo: (channelName) => {
			if (closed) return;
			detach();
			if (channelName === null) return;
			const opened = openChannel(channelName);
			if (!opened) return;
			opened.onmessage = (message) => {
				const event = parseWriteOutcomeEnvelope(message.data);
				if (!event) {
					options.onUnreadableMessage?.();
					return;
				}
				// A snapshot: a listener that unsubscribes while we fan out (the
				// engine's own bridge subscription does exactly that on disposal)
				// must not perturb this iteration.
				for (const listener of [...listeners]) {
					try {
						listener(event);
					} catch {
						// A throwing consumer must not cost the other tabs' listeners
						// their outcome; the engine reports its own listener errors.
					}
				}
			};
			channel = opened;
		},
		close: () => {
			closed = true;
			detach();
			listeners.clear();
		},
	};
}
