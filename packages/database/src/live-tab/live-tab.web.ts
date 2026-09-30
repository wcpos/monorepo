import { BehaviorSubject } from 'rxjs';

import { LiveTabNotOwnedError } from './ownership-error';

export { LiveTabNotOwnedError } from './ownership-error';

// SAHPool is per origin; the user DB opens before any store identity exists.
// Ownership is therefore one live tab per SITE, not the spec's per-store lock.
export const LIVE_TAB_LOCK_NAME = 'wcpos-live-tab';
export const LIVE_TAB_CHANNEL_NAME = 'wcpos-live-tab';
export const TAKEOVER_ANSWER_TIMEOUT_MS = 3_000; // A few seconds before asking to close the other tab.
// Bounds a WRITE hold only. A payment hold is never abandoned: the parked holder keeps its
// reader session, so a card approved after a forced handover would be charged with no tab
// left to post the capture, and the next owner would mark the row failed. The device leg's
// own 300 s deadline cancels the collection, which bounds the wait.
export const TAKEOVER_DEFER_CEILING_MS = 15_000;
export const HANDOVER_TEARDOWN_DEADLINE_MS = 10_000; // After the takeover ceiling, bound storage disposal.
type Hold = 'payment' | 'write';
export type LiveTabState =
	| { kind: 'acquiring' }
	| { kind: 'live' }
	| { kind: 'parked'; reason: 'another-tab-live' | 'worker-lost' }
	| { kind: 'taking-over'; deferral: null | Hold | 'no-answer' };
type Message =
	| { type: 'live' }
	| {
			type: 'takeover-request' | 'takeover-ack' | 'takeover-released';
			requestId: string;
			deferral?: Hold | null;
	  };
type Channel = {
	onmessage: ((event: MessageEvent<unknown>) => void) | null;
	postMessage(data: Message): void;
	close(): void;
};
type Dependencies = {
	locks?: {
		request(
			name: string,
			options: LockOptions,
			callback: (lock: Lock | null) => Promise<void>
		): Promise<void>;
	};
	channel: (name: string) => Channel;
	clock?: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>;
	onHandover(): Promise<void>;
	onUnavailable(): void;
	onError(error: unknown): void;
};
let ownsPool = false;
const holds = new Map<symbol, Hold>();
const released = new Set<() => void>();
export function holdLiveTab(reason: Hold): () => void {
	if (!ownsPool) throw new LiveTabNotOwnedError();
	const key = Symbol();
	holds.set(key, reason);
	return () => {
		// Every release wakes the handover so it can re-read the remaining holds' reason.
		if (holds.delete(key)) for (const notify of released) notify();
	};
}

export function createLiveTab(deps: Dependencies) {
	ownsPool = false;
	const state = new BehaviorSubject<LiveTabState>({ kind: 'acquiring' });
	const clock = deps.clock ?? globalThis;
	const channel = deps.channel(LIVE_TAB_CHANNEL_NAME);
	let acquisition: AbortController | undefined;
	let disposed = false;
	let lost = false;
	let unlock: (() => void) | undefined;
	let lockDone: Promise<unknown> | undefined;
	let requestId: string | undefined;
	let answerTimer: ReturnType<typeof setTimeout> | undefined;
	let finishWaiting: (() => void) | undefined;
	let handingOver = false;
	const requests = new Set<string>();
	const set = (value: LiveTabState) => {
		if (!disposed) {
			ownsPool = value.kind === 'live';
			state.next(value);
		}
	};
	const reason = () =>
		[...holds.values()].includes('payment') ? 'payment' : holds.size ? 'write' : null;
	const park = (why: 'another-tab-live' | 'worker-lost') => {
		lost ||= why === 'worker-lost';
		clock.clearTimeout(answerTimer);
		set({ kind: 'parked', reason: why });
		unlock?.();
		unlock = undefined;
		finishWaiting?.();
	};
	const acquire = (ifAvailable: boolean) => {
		const controller = new AbortController();
		acquisition = controller;
		lockDone = deps
			.locks!.request(
				LIVE_TAB_LOCK_NAME,
				ifAvailable ? { ifAvailable: true } : { signal: controller.signal },
				async (lock) => {
					if (disposed || lost) return;
					if (!lock) {
						set({ kind: 'parked', reason: 'another-tab-live' });
						return;
					}
					clock.clearTimeout(answerTimer);
					await new Promise<void>((resolve) => {
						unlock = resolve;
						set({ kind: 'live' });
						channel.postMessage({ type: 'live' });
					});
				}
			)
			.catch((error) => {
				if (disposed || controller.signal.aborted) return;
				// A request that REJECTS before any grant (a sandboxed or opaque context,
				// #1057's write lease saw the same) is an absent API, not a dead worker:
				// there is nothing to coordinate with, so the tab runs live rather than
				// telling the cashier to reload forever. A rejected takeover request just
				// leaves the tab parked, so Take over here can be pressed again.
				deps.onError(error);
				if (state.value.kind === 'acquiring') {
					deps.onUnavailable();
					set({ kind: 'live' });
				} else if (state.value.kind === 'taking-over') {
					clock.clearTimeout(answerTimer);
					set({ kind: 'parked', reason: 'another-tab-live' });
				} else {
					park('worker-lost');
				}
			});
	};
	const handover = async () => {
		handingOver = true;
		if (holds.size) {
			let expired = false;
			let timer: ReturnType<typeof setTimeout> | undefined;
			// Collection may release then start capture before this continuation runs.
			// Recheck each replacement hold. The ceiling runs only while the holds are
			// write-only, and a replacement write hold does not reset it.
			while (holds.size && !expired && !disposed && !lost) {
				if (reason() === 'write' && timer === undefined) {
					timer = clock.setTimeout(() => {
						if (reason() === 'payment') {
							timer = undefined; // A payment began under the ceiling; wait it out.
							return;
						}
						expired = true;
						ownsPool = false;
						finishWaiting?.();
					}, TAKEOVER_DEFER_CEILING_MS);
				}
				await new Promise<void>((resolve) => {
					const done = () => {
						released.delete(done);
						finishWaiting = undefined;
						resolve();
					};
					finishWaiting = done;
					released.add(done);
				});
			}
			clock.clearTimeout(timer);
		}
		if (disposed || lost) return;
		holds.clear(); // Releases from a capture that outlives the ceiling become no-ops.
		// Gate unmounts the app before onHandover closes any database.
		set({ kind: 'parked', reason: 'another-tab-live' });
		try {
			await deps.onHandover();
			if (disposed || lost) return;
			unlock?.();
			unlock = undefined;
			await lockDone;
			for (const id of requests) channel.postMessage({ type: 'takeover-released', requestId: id });
		} catch (error) {
			// Never release ownership over handles that teardown failed to close.
			deps.onError(error);
			lost = true;
			set({ kind: 'parked', reason: 'worker-lost' });
		} finally {
			requests.clear();
			handingOver = false;
		}
	};
	channel.onmessage = ({ data }) => {
		if (disposed || lost || !data || typeof data !== 'object') return;
		const message = data as Message;
		if (message.type === 'live') {
			if (state.value.kind === 'taking-over') {
				acquisition?.abort();
				park('another-tab-live');
			}
			return;
		}
		if (typeof message.requestId !== 'string') return;
		if (message.type === 'takeover-request' && (state.value.kind === 'live' || handingOver)) {
			requests.add(message.requestId);
			channel.postMessage({
				type: 'takeover-ack',
				requestId: message.requestId,
				deferral: reason(),
			});
			if (!handingOver) void handover();
		} else if (
			message.type === 'takeover-ack' &&
			message.requestId === requestId &&
			state.value.kind === 'taking-over'
		) {
			clock.clearTimeout(answerTimer);
			set({ kind: 'taking-over', deferral: message.deferral ?? null });
		}
	};
	if (deps.locks) acquire(true);
	else {
		deps.onUnavailable();
		set({ kind: 'live' });
	}
	// No pagehide/beforeunload handler: the lock and dedicated worker die with the tab.
	return {
		state$: state.asObservable(),
		getState: () => state.value,
		park,
		takeOver() {
			if (disposed || lost || handingOver || state.value.kind !== 'parked') return;
			requestId = crypto.randomUUID();
			set({ kind: 'taking-over', deferral: null });
			answerTimer = clock.setTimeout(
				() => set({ kind: 'taking-over', deferral: 'no-answer' }),
				TAKEOVER_ANSWER_TIMEOUT_MS
			);
			channel.postMessage({ type: 'takeover-request', requestId });
			acquire(false);
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			ownsPool = false;
			holds.clear();
			acquisition?.abort();
			clock.clearTimeout(answerTimer);
			finishWaiting?.();
			unlock?.();
			channel.close();
			state.complete();
		},
	};
}
