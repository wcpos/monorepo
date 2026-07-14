import type { EngineEvent, RxdbSyncEngine } from '@wcpos/sync-engine';

export type AwaitedWriteOutcome = 'success' | 'success-local';

const TERMINAL_WRITE_EVENTS = new Set<EngineEvent['type']>([
	'write-acknowledged',
	'write-ack-rematerialized',
	'write-annihilated',
	'write-conflict',
	'write-rejected',
]);

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
					finish(() => reject(new Error(`${event.type} for mutation "${mutationId}"`)));
					break;
			}
		});
		if (settled) unsubscribe();

		void engine.sync('write-drain').catch((error) => finish(() => reject(error)));
	});
}
