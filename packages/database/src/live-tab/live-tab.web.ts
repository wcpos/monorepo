import { BehaviorSubject } from 'rxjs';

// SAHPool is per origin; the user DB opens before any store identity exists.
// Ownership is therefore one live tab per SITE, not the spec's per-store lock.
export const LIVE_TAB_LOCK_NAME = 'wcpos-live-tab';
export const LIVE_TAB_CHANNEL_NAME = 'wcpos-live-tab';
export const TAKEOVER_ANSWER_TIMEOUT_MS = 3_000; // A few seconds before asking to close the other tab.
export const TAKEOVER_DEFER_CEILING_MS = 15_000; // Allow a card round trip, not indefinite lockout.
type Hold = 'payment' | 'write';
export type LiveTabState =
	| { kind: 'acquiring' }
	| { kind: 'live' }
	| { kind: 'parked'; reason: 'another-tab-live' | 'worker-lost' }
	| { kind: 'taking-over'; deferral: null | Hold | 'no-answer' };
type Message = {
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
const holds = new Map<symbol, Hold>();
const released = new Set<() => void>();
export function holdLiveTab(reason: Hold): () => void {
	const key = Symbol();
	holds.set(key, reason);
	return () => {
		if (holds.delete(key) && !holds.size) for (const notify of released) notify();
	};
}

export function createLiveTab(deps: Dependencies) {
	const state = new BehaviorSubject<LiveTabState>({ kind: 'acquiring' });
	const clock = deps.clock ?? globalThis;
	const channel = deps.channel(LIVE_TAB_CHANNEL_NAME);
	const controller = new AbortController();
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
		if (!disposed) state.next(value);
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
					});
				}
			)
			.catch((error) => {
				if (!disposed) {
					deps.onError(error);
					park('worker-lost');
				}
			});
	};
	const handover = async () => {
		handingOver = true;
		if (holds.size)
			await new Promise<void>((resolve) => {
				const done = () => {
					clock.clearTimeout(timer);
					released.delete(done);
					finishWaiting = undefined;
					resolve();
				};
				const timer = clock.setTimeout(done, TAKEOVER_DEFER_CEILING_MS);
				finishWaiting = done;
				released.add(done);
			});
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
			controller.abort();
			clock.clearTimeout(answerTimer);
			finishWaiting?.();
			unlock?.();
			channel.close();
			state.complete();
		},
	};
}
