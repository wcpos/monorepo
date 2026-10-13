import { TERMINAL_WRITE_EVENT_TYPES } from '@wcpos/sync-engine';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

type AwaitedWriteOutcome = 'success' | 'success-local';

export class WriteOutcomeError extends Error {
	eventType: 'write-rejected' | 'write-conflict';
	status?: number;
	reason?: string;
	/** The server's own (already localized) sentence; `reason` is the machine code. */
	serverMessage?: string;

	constructor(
		eventType: WriteOutcomeError['eventType'],
		mutationId: string,
		status?: number,
		reason?: string,
		serverMessage?: string
	) {
		super(`${eventType} for mutation "${mutationId}"`);
		this.name = 'WriteOutcomeError';
		this.eventType = eventType;
		this.status = status;
		this.reason = reason;
		this.serverMessage = serverMessage;
	}
}

/**
 * No terminal outcome arrived in time. `diagnostics` is the engine's push state at that moment:
 * timeouts where no push request went out at all (Sentry CHECKOUT101) carried nothing to say why.
 */
export class WriteOutcomeTimeoutError extends Error {
	diagnostics: Record<string, unknown>;

	constructor(mutationId: string, diagnostics: Record<string, unknown>) {
		super(`Timed out waiting for mutation "${mutationId}"`);
		this.name = 'WriteOutcomeTimeoutError';
		this.diagnostics = diagnostics;
	}
}

function pushStateSnapshot(engine: Pick<RxdbSyncEngine, 'status'>): Record<string, unknown> {
	// A diagnostic must never replace the timeout verdict it annotates.
	try {
		const status = engine.status();
		const drain = status.lanes['write-drain'];
		return {
			connectivity: status.connectivity,
			authRequired: status.authRequired,
			writeSessionHeld: status.writeSessionHeld,
			gatedBy: status.gatedBy,
			queueDepth: status.queueDepth,
			writeDrainLastTickAtMs: drain.lastTick?.atMs ?? null,
			writeDrainLastTickStatus: drain.lastTick?.status ?? null,
			writeDrainLastError: drain.lastError,
			writeDrainNextDueAtMs: drain.nextDueAtMs ?? null,
		};
	} catch {
		return {};
	}
}

export class WriteDeferredError extends Error {
	status?: number;
	reason?: string;

	constructor(mutationId: string, status?: number, reason?: string) {
		super(`write-deferred (${status}) for mutation "${mutationId}"`);
		this.name = 'WriteDeferredError';
		this.status = status;
		this.reason = reason;
	}
}

export function awaitWriteOutcome(
	engine: Pick<RxdbSyncEngine, 'events' | 'status' | 'sync'>,
	mutationId: string,
	options: { timeoutMs?: number } = {}
): Promise<AwaitedWriteOutcome> {
	const timeoutMs = options.timeoutMs ?? 15_000;

	return new Promise((resolve, reject) => {
		let settled = false;
		let unsubscribe: (() => void) | undefined;
		const timeout = setTimeout(() => {
			finish(() => reject(new WriteOutcomeTimeoutError(mutationId, pushStateSnapshot(engine))));
		}, timeoutMs);

		const finish = (settle: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			unsubscribe?.();
			settle();
		};

		unsubscribe = engine.events(
			(event) => {
				if (
					// The engine is the producer of this set, so it is imported, not mirrored.
					(!TERMINAL_WRITE_EVENT_TYPES.has(event.type) && event.type !== 'write-deferred') ||
					!('mutationId' in event) ||
					event.mutationId !== mutationId
				) {
					return;
				}

				switch (event.type) {
					case 'write-deferred':
						if (event.status === 401) {
							finish(() => reject(new WriteDeferredError(mutationId, event.status, event.reason)));
						}
						break;
					case 'write-acknowledged':
					case 'write-ack-rematerialized':
						finish(() => resolve('success'));
						break;
					case 'write-annihilated':
						finish(() => resolve('success-local'));
						break;
					case 'write-conflict':
					case 'write-rejected':
						finish(() => {
							const detail = event as { status?: number; reason?: string; serverMessage?: string };
							reject(
								new WriteOutcomeError(
									event.type,
									mutationId,
									detail.status,
									detail.reason,
									detail.serverMessage
								)
							);
						});
						break;
				}
			},
			{ replayWriteOutcomeFor: mutationId }
		);
		// The replay fires synchronously inside events(), so `settled` may already
		// be true here — this is what releases the subscription in that case.
		if (settled) {
			unsubscribe();
			return;
		}

		// A standing auth hold is the 401 verdict known up front. A retry enqueued behind
		// a held row is FIFO-blocked in the backoff window, where no drain reports it, so
		// without this it would wait out the clock to learn what the engine already knows.
		if (engine.status().authRequired) {
			finish(() => reject(new WriteDeferredError(mutationId, 401, 'auth-required')));
			return;
		}

		void engine.sync('write-drain').catch((error) => finish(() => reject(error)));
	});
}
