import type { EngineEvent, RxdbSyncEngine } from '@wcpos/sync-engine';

import {
	awaitTerminalWriteOutcome,
	awaitWriteOutcome,
	awaitWriteSettlement,
	WriteOutcomeError,
} from '../src/await-write-outcome';

function createEngine() {
	let listener: ((event: EngineEvent) => void) | undefined;
	const unsubscribe = jest.fn();
	const unsubscribeStatus = jest.fn();
	let statusListener: ((status: { connectivity: string }) => void) | undefined;
	const statusChanges = jest.fn((callback: typeof statusListener) => {
		statusListener = callback;
		callback?.({ connectivity: 'online' });
		return unsubscribeStatus;
	});
	const sync = jest.fn().mockResolvedValue({ status: 'ok' });
	const events = jest.fn((callback: (event: EngineEvent) => void) => {
		listener = callback;
		return unsubscribe;
	});
	return {
		engine: { events, sync, statusChanges } as unknown as RxdbSyncEngine,
		emit: (event: EngineEvent) => listener?.(event),
		offline: () => statusListener?.({ connectivity: 'offline' }),
		statusChanges,
		unsubscribeStatus,
		events,
		sync,
		unsubscribe,
	};
}

describe('write-superseded re-binding', () => {
	it('follows a coalesced replacement and settles on the new id', async () => {
		const { engine, emit, events } = createEngine();
		const outcome = awaitTerminalWriteOutcome(engine, 'mutation-1');
		emit({
			type: 'write-superseded',
			collection: 'orders',
			recordId: 'order-1',
			mutationId: 'mutation-1',
			replacedBy: 'mutation-2',
		});
		// The old id is orphaned: an event naming it must not settle anything.
		emit({
			type: 'write-acknowledged',
			collection: 'orders',
			recordId: 'order-1',
			mutationId: 'mutation-1',
			currentRevision: 'rev-2',
		});
		expect(events).toHaveBeenLastCalledWith(expect.any(Function), {
			replayWriteOutcomeFor: 'mutation-2',
		});
		emit({
			type: 'write-rejected',
			collection: 'orders',
			recordId: 'order-1',
			mutationId: 'mutation-2',
			status: 400,
			reason: 'rest_invalid_param',
		});
		await expect(outcome).rejects.toMatchObject({ status: 400, reason: 'rest_invalid_param' });
	});

	it('re-binds on a replayed supersede and resolves on the replacement replay', async () => {
		const unsubscribe = jest.fn();
		const replays: Record<string, EngineEvent> = {
			'mutation-1': {
				type: 'write-superseded',
				collection: 'orders',
				recordId: 'order-1',
				mutationId: 'mutation-1',
				replacedBy: 'mutation-2',
			},
			'mutation-2': {
				type: 'write-acknowledged',
				collection: 'orders',
				recordId: 'order-1',
				mutationId: 'mutation-2',
				currentRevision: 'rev-3',
			},
		};
		const events = jest.fn(
			(callback: (event: EngineEvent) => void, options?: { replayWriteOutcomeFor?: string }) => {
				const replay = options?.replayWriteOutcomeFor && replays[options.replayWriteOutcomeFor];
				if (replay) callback(replay);
				return unsubscribe;
			}
		);
		const engine = { events } as unknown as RxdbSyncEngine;
		await expect(awaitTerminalWriteOutcome(engine, 'mutation-1')).resolves.toBe('success');
		expect(events).toHaveBeenCalledTimes(2);
		expect(unsubscribe).toHaveBeenCalledTimes(2);
	});
});

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

	it('exposes rejection status and reason on a WriteOutcomeError', async () => {
		const { engine, emit } = createEngine();
		const outcome = awaitWriteOutcome(engine, 'mutation-1', { timeoutMs: 100 });

		emit({
			type: 'write-rejected',
			collection: 'orders',
			recordId: 'order-1',
			mutationId: 'mutation-1',
			status: 403,
			reason: 'woocommerce_rest_cannot_delete',
		});

		const error = await outcome.catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(WriteOutcomeError);
		expect(error).toMatchObject({
			name: 'WriteOutcomeError',
			eventType: 'write-rejected',
			status: 403,
			reason: 'woocommerce_rest_cannot_delete',
		});
	});

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

describe('clock-free settlement', () => {
	const ack = {
		type: 'write-annihilated',
		collection: 'orders',
		recordId: 'o',
		mutationId: 'm',
	} as const;
	it.each(['drain', 'status', 'current'] as const)(
		'queues offline via %s and releases both listeners',
		async (source) => {
			const e = createEngine();
			if (source === 'drain') e.sync.mockResolvedValue({ status: 'skipped', reason: 'offline' });
			if (source === 'current')
				e.statusChanges.mockImplementation((callback) => {
					callback?.({ connectivity: 'offline' });
					return e.unsubscribeStatus;
				});
			const result = awaitWriteSettlement(e.engine, 'm');
			if (source === 'status') e.offline();
			await expect(result).resolves.toBe('queued-offline');
			expect(e.unsubscribe).toHaveBeenCalledTimes(1);
			expect(e.unsubscribeStatus).toHaveBeenCalledTimes(1);
		}
	);
	it('never settles on a clock or another mutation', async () => {
		jest.useFakeTimers();
		try {
			const e = createEngine();
			const settled = jest.fn();
			const result = awaitWriteSettlement(e.engine, 'm').then(settled);
			e.emit({ ...ack, mutationId: 'other' });
			await jest.advanceTimersByTimeAsync(60_000);
			expect(settled).not.toHaveBeenCalled();
			e.emit(ack);
			await result;
			expect(settled).toHaveBeenCalledWith('success-local');
			expect(e.unsubscribeStatus).toHaveBeenCalledTimes(1);
		} finally {
			jest.useRealTimers();
		}
	});
	it.each([awaitWriteSettlement, awaitTerminalWriteOutcome])(
		'replays terminal outcomes and releases the listener (%p)',
		async (awaitOutcome) => {
			const e = createEngine();
			e.events.mockImplementation((callback) => {
				callback(ack);
				return e.unsubscribe;
			});
			await expect(awaitOutcome(e.engine, 'm')).resolves.toBe('success-local');
			expect(e.unsubscribe).toHaveBeenCalledTimes(1);
		}
	);
	it('terminal-only wait does not kick a drain and preserves the server reason', async () => {
		const e = createEngine();
		const result = awaitTerminalWriteOutcome(e.engine, 'm');
		e.emit({
			...ack,
			type: 'write-rejected',
			status: 403,
			reason: 'refused',
			serverMessage: 'No permission',
		});
		await expect(result).rejects.toMatchObject({
			status: 403,
			reason: 'refused',
			serverMessage: 'No permission',
		});
		expect(e.sync).not.toHaveBeenCalled();
	});
	it('drain failure rejects and cleans up', async () => {
		const e = createEngine();
		e.sync.mockRejectedValue(new Error('drain failed'));
		await expect(awaitWriteSettlement(e.engine, 'm')).rejects.toThrow('drain failed');
		expect(e.unsubscribe).toHaveBeenCalledTimes(1);
		expect(e.unsubscribeStatus).toHaveBeenCalledTimes(1);
	});
});
