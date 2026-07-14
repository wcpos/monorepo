import type { EngineEvent, RxdbSyncEngine } from '@wcpos/sync-engine';

import { awaitWriteOutcome } from '../src/await-write-outcome';

function createEngine() {
	let listener: ((event: EngineEvent) => void) | undefined;
	const unsubscribe = jest.fn();
	const sync = jest.fn().mockResolvedValue({ status: 'ok' });
	const events = jest.fn((callback: (event: EngineEvent) => void) => {
		listener = callback;
		return unsubscribe;
	});
	return {
		engine: { events, sync } as unknown as RxdbSyncEngine,
		emit: (event: EngineEvent) => listener?.(event),
		events,
		sync,
		unsubscribe,
	};
}

describe('awaitWriteOutcome', () => {
	it.each(['write-acknowledged', 'write-ack-rematerialized'] as const)(
		'resolves success for a matching %s event',
		async (type) => {
			const { engine, emit, sync, unsubscribe } = createEngine();
			const outcome = awaitWriteOutcome(engine, 'mutation-1', { timeoutMs: 100 });

			emit({
				type,
				collection: 'orders',
				recordId: 'order-1',
				mutationId: 'mutation-1',
				currentRevision: 'rev-2',
			});

			await expect(outcome).resolves.toBe('success');
			expect(sync).toHaveBeenCalledWith('write-drain');
			expect(unsubscribe).toHaveBeenCalledTimes(1);
		}
	);

	it('resolves success-local for a matching annihilated event', async () => {
		const { engine, emit } = createEngine();
		const outcome = awaitWriteOutcome(engine, 'mutation-1', { timeoutMs: 100 });

		emit({
			type: 'write-annihilated',
			collection: 'orders',
			recordId: 'order-1',
			mutationId: 'mutation-1',
		});

		await expect(outcome).resolves.toBe('success-local');
	});

	it.each(['write-conflict', 'write-rejected'] as const)(
		'rejects for a matching %s event',
		async (type) => {
			const { engine, emit } = createEngine();
			const outcome = awaitWriteOutcome(engine, 'mutation-1', { timeoutMs: 100 });

			emit({
				type,
				collection: 'orders',
				recordId: 'order-1',
				mutationId: 'mutation-1',
				...(type === 'write-conflict' ? { currentRevision: 'rev-2' } : {}),
			});

			await expect(outcome).rejects.toThrow(`${type} for mutation "mutation-1"`);
		}
	);

	it('ignores terminal events for other mutations and rejects on timeout', async () => {
		jest.useFakeTimers();
		try {
			const { engine, emit, unsubscribe } = createEngine();
			const outcome = awaitWriteOutcome(engine, 'mutation-1', { timeoutMs: 25 });
			emit({
				type: 'write-rejected',
				collection: 'orders',
				recordId: 'order-1',
				mutationId: 'mutation-2',
			});

			jest.advanceTimersByTime(25);

			await expect(outcome).rejects.toThrow('Timed out waiting for mutation "mutation-1"');
			expect(unsubscribe).toHaveBeenCalledTimes(1);
		} finally {
			jest.useRealTimers();
		}
	});

	it('subscribes before sync and handles an event emitted before sync resolves', async () => {
		const calls: string[] = [];
		let listener: ((event: EngineEvent) => void) | undefined;
		const engine = {
			events: (callback: (event: EngineEvent) => void) => {
				calls.push('events');
				listener = callback;
				return jest.fn();
			},
			sync: jest.fn(() => {
				calls.push('sync');
				listener?.({
					type: 'write-acknowledged',
					collection: 'orders',
					recordId: 'order-1',
					mutationId: 'mutation-1',
					currentRevision: 'rev-2',
				});
				return new Promise(() => undefined);
			}),
		} as unknown as RxdbSyncEngine;

		await expect(awaitWriteOutcome(engine, 'mutation-1', { timeoutMs: 100 })).resolves.toBe(
			'success'
		);
		expect(calls).toEqual(['events', 'sync']);
	});
});
