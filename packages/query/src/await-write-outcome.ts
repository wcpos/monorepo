import { TERMINAL_WRITE_EVENT_TYPES } from '@wcpos/sync-engine';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

type AwaitedWriteOutcome = 'success' | 'success-local';

export class WriteOutcomeError extends Error {
	eventType: 'write-rejected' | 'write-conflict';
	status?: number;
	reason?: string;
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

function subscribeTerminal(
	engine: Pick<RxdbSyncEngine, 'events'>,
	mutationId: string,
	resolve: (outcome: AwaitedWriteOutcome) => void,
	reject: (error: unknown) => void
) {
	return engine.events(
		(event) => {
			if (
				!TERMINAL_WRITE_EVENT_TYPES.has(event.type) ||
				!('mutationId' in event) ||
				event.mutationId !== mutationId
			)
				return;
			switch (event.type) {
				case 'write-acknowledged':
				case 'write-ack-rematerialized':
					resolve('success');
					break;
				case 'write-annihilated':
					resolve('success-local');
					break;
				case 'write-conflict':
				case 'write-rejected': {
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
					break;
				}
			}
		},
		{ replayWriteOutcomeFor: mutationId }
	);
}

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

		unsubscribe = subscribeTerminal(
			engine,
			mutationId,
			(value) => finish(() => resolve(value)),
			(error) => finish(() => reject(error))
		);
		// The replay fires synchronously inside events(), so `settled` may already
		// be true here — this is what releases the subscription in that case.
		if (settled) unsubscribe();

		void engine.sync('write-drain').catch((error) => finish(() => reject(error)));
	});
}

export type WriteSettlement = AwaitedWriteOutcome | 'queued-offline';

/** No clock or drain kick: only terminal write events, including replay. */
export function awaitTerminalWriteOutcome(
	engine: Pick<RxdbSyncEngine, 'events'>,
	mutationId: string
): Promise<AwaitedWriteOutcome> {
	return new Promise((resolve, reject) => {
		let settled = false;
		let unsubscribe: (() => void) | undefined;
		const finish = (settle: () => void) => {
			if (settled) return;
			settled = true;
			unsubscribe?.();
			settle();
		};
		unsubscribe = subscribeTerminal(
			engine,
			mutationId,
			(value) => finish(() => resolve(value)),
			(error) => finish(() => reject(error))
		);
		if (settled) unsubscribe();
	});
}

/** No clock: terminal replay, an offline drain report, or offline engine status settles. */
export function awaitWriteSettlement(
	engine: Pick<RxdbSyncEngine, 'events' | 'sync' | 'statusChanges'>,
	mutationId: string
): Promise<WriteSettlement> {
	return new Promise((resolve, reject) => {
		let settled = false;
		let unsubscribe: (() => void) | undefined;
		let unsubscribeStatus: (() => void) | undefined;
		const finish = (settle: () => void) => {
			if (settled) return;
			settled = true;
			unsubscribe?.();
			unsubscribeStatus?.();
			settle();
		};
		unsubscribe = subscribeTerminal(
			engine,
			mutationId,
			(value) => finish(() => resolve(value)),
			(error) => finish(() => reject(error))
		);
		if (settled) unsubscribe();
		unsubscribeStatus = engine.statusChanges((status) => {
			if (status.connectivity === 'offline') finish(() => resolve('queued-offline'));
		});
		if (settled) unsubscribeStatus();
		void engine.sync('write-drain').then(
			(report) => {
				if (report.status === 'skipped' && report.reason === 'offline')
					finish(() => resolve('queued-offline'));
			},
			(error) => finish(() => reject(error))
		);
	});
}
