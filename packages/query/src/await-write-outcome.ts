import { TERMINAL_WRITE_EVENT_TYPES } from '@wcpos/sync-engine';

import type { EngineEvent, RxdbSyncEngine } from '@wcpos/sync-engine';

type AwaitedWriteOutcome = 'success' | 'success-local';

export class WriteOutcomeError extends Error {
	eventType: 'write-rejected' | 'write-conflict';
	status?: number;
	reason?: string;

	constructor(
		eventType: WriteOutcomeError['eventType'],
		mutationId: string,
		status?: number,
		reason?: string
	) {
		super(`${eventType} for mutation "${mutationId}"`);
		this.name = 'WriteOutcomeError';
		this.eventType = eventType;
		this.status = status;
		this.reason = reason;
	}
}

/** The engine is the producer of these, so the list is imported rather than mirrored. */
const TERMINAL_WRITE_EVENTS = TERMINAL_WRITE_EVENT_TYPES;

export function awaitWriteOutcome(
	engine: Pick<RxdbSyncEngine, 'events' | 'sync'>,
	mutationId: string,
	options: { timeoutMs?: number } = {}
): Promise<AwaitedWriteOutcome> {
	const timeoutMs = options.timeoutMs ?? 15_000;

	return new Promise((resolve, reject) => {
		let settled = false;
		let unsubscribe: (() => void) | undefined;
		const timeout = setTimeout(() => {
			finish(() => reject(new Error(`Timed out waiting for mutation "${mutationId}"`)));
		}, timeoutMs);

		const finish = (settle: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			unsubscribe?.();
			settle();
		};

		unsubscribe = engine.events((event) => {
			if (
				!TERMINAL_WRITE_EVENTS.has(event.type) ||
				!('mutationId' in event) ||
				event.mutationId !== mutationId
			) {
				return;
			}

			switch (event.type) {
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
						const detail = event as { status?: number; reason?: string };
						reject(new WriteOutcomeError(event.type, mutationId, detail.status, detail.reason));
					});
					break;
			}
		}, { replayWriteOutcomeFor: mutationId });
		// The replay fires synchronously inside events(), so `settled` may already
		// be true here — this is what releases the subscription in that case.
		if (settled) unsubscribe();

		void engine.sync('write-drain').catch((error) => finish(() => reject(error)));
	});
}
