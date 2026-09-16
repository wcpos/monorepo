import { describe, expect, it, vi } from 'vitest';

import {
	applyReplicationActions,
	createHybridChangeSignalEngine,
	type HybridPollOutcome,
	type ScopeDatabase,
	StoreScopeManager,
	type SyncEvent,
} from '@wcpos/sync-core';

import { createScopeBarcodeSelectors } from '../materialization/barcode-selectors';
import { CHANGE_SIGNAL_STATE_KEY, createChangeSignalLane } from './change-signal-lane';
import { ChangeSignalPoisonError } from './change-signal-source';
import { deserializeChangeSignalState } from './change-signal-state';

import type { QueryTotalCacheEntry } from '../scheduler';

const mocks = vi.hoisted(() => ({
	poll: vi.fn(),
}));

vi.mock('@wcpos/sync-core', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@wcpos/sync-core')>();
	return {
		...actual,
		createHybridChangeSignalEngine: vi.fn(() => ({ poll: mocks.poll })),
		planReplicationActions: vi.fn(() => ({
			targetedPulls: [],
			deletes: [],
			rebaselineCollections: [],
			reFetchCollections: [],
		})),
		applyReplicationActions: vi.fn(async () => ({ reDerived: [] }) as never),
	};
});

function stubDatabase(): ScopeDatabase {
	return {
		listCollections: () => [],
		resetCollection: async () => {},
		pendingMutationCount: async () => 0,
		close: async () => {},
	};
}

describe('change-signal cursor observability', () => {
	it('keeps the HTTP status when the cold-start head fetch returns 401', async () => {
		const manager = new StoreScopeManager({ createDatabase: async () => stubDatabase() });
		await manager.switchTo('scope-a');
		const diagnostics = vi.fn();
		const fetcher = vi.fn(async () => new Response(null, { status: 401 }));
		const lane = createChangeSignalLane({
			manager,
			databaseFor: () => ({ collections: {} }) as never,
			fetcher,
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			readBlob: async () => null,
			writeBlob: vi.fn(),
			connectivity: () => 'online',
			diagnostics,
			emitEvent: () => undefined,
		});

		expect(await lane.tick()).toMatchObject({ status: 'error' });
		expect(fetcher).toHaveBeenCalledWith(
			expect.stringContaining('/changes/sequence-log?'),
			expect.anything()
		);
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'signal.tick.error',
				fields: { lane: 'change-signal', status: 401 },
			})
		);
	});

	it('emits the lane and HTTP status when a tick fetch returns 401', async () => {
		const actual = await vi.importActual<typeof import('@wcpos/sync-core')>('@wcpos/sync-core');
		vi.mocked(createHybridChangeSignalEngine).mockImplementationOnce(
			actual.createHybridChangeSignalEngine
		);
		const manager = new StoreScopeManager({ createDatabase: async () => stubDatabase() });
		await manager.switchTo('scope-a');
		const diagnostics = vi.fn();
		const fetcher = vi.fn(async () => new Response(null, { status: 401 }));
		const lane = createChangeSignalLane({
			manager,
			databaseFor: () => ({ collections: {} }) as never,
			fetcher,
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			readBlob: async () => JSON.stringify({ cursor: { sequence: 5 }, baselineDigests: [] }),
			writeBlob: vi.fn(),
			connectivity: () => 'online',
			diagnostics,
			emitEvent: () => undefined,
		});

		expect(await lane.tick()).toMatchObject({ status: 'error' });
		expect(fetcher).toHaveBeenCalledWith(
			expect.stringContaining('/changes/tick'),
			expect.anything()
		);
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'signal.tick.error',
				level: 'error',
				fields: { lane: 'change-signal', status: 401 },
			})
		);
	});

	it('emits backwards when a poll reports zero behind a non-zero cursor', async () => {
		const manager = new StoreScopeManager({
			createDatabase: async () => stubDatabase(),
		});
		await manager.switchTo('scope-a');
		const events: SyncEvent[] = [];
		const outcome: HybridPollOutcome = {
			changes: [],
			previousCursor: { sequence: 5 },
			cursor: { sequence: 0 },
			rebaseline: false,
			sweepRan: false,
			sweepIncomplete: false,
			integrityMismatches: [],
			idsToPull: [],
			escalatedIds: [],
			clearedEscalations: [],
			escalationLedger: [],
			baselineDigests: new Map(),
		};
		mocks.poll.mockResolvedValueOnce(outcome);
		const lane = createChangeSignalLane({
			manager,
			databaseFor: () => ({ collections: {} }) as never,
			fetcher: vi.fn(),
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			readBlob: async () => JSON.stringify({ cursor: { sequence: 5 }, baselineDigests: [] }),
			writeBlob: vi.fn(),
			connectivity: () => 'online',
			diagnostics: (event) => events.push(event),
			emitEvent: () => undefined,
		});

		await lane.tick();

		expect(events.filter((event) => event.type === 'signal.cursor')).toEqual([
			expect.objectContaining({
				level: 'warn',
				fields: expect.objectContaining({
					reason: 'backwards',
					from: 5,
					to: 0,
				}),
			}),
		]);
	});
});

describe('config change events', () => {
	it('emits changed collection names only after a completed cycle carries fingerprint moves', async () => {
		const manager = new StoreScopeManager({
			createDatabase: async () => stubDatabase(),
		});
		await manager.switchTo('scope-a');
		const emptyOutcome: HybridPollOutcome = {
			changes: [],
			cursor: { sequence: 1 },
			rebaseline: false,
			sweepRan: false,
			sweepIncomplete: false,
			integrityMismatches: [],
			idsToPull: [],
			escalatedIds: [],
			clearedEscalations: [],
			escalationLedger: [],
			baselineDigests: new Map(),
			configChanges: [],
		};
		mocks.poll.mockResolvedValueOnce(emptyOutcome).mockResolvedValueOnce({
			...emptyOutcome,
			cursor: { sequence: 2 },
			configChanges: [
				{
					collection: 'tax_rates',
					from: 'tax-v1',
					to: 'tax-v2',
					source: 'config-fingerprint',
				},
			],
		});
		let finishApply!: () => void;
		let markApplyStarted!: () => void;
		const applyFinished = new Promise<void>((resolve) => {
			finishApply = resolve;
		});
		const applyStarted = new Promise<void>((resolve) => {
			markApplyStarted = resolve;
		});
		vi.mocked(applyReplicationActions).mockImplementationOnce((async () => ({
			reDerived: [],
		})) as never);
		vi.mocked(applyReplicationActions).mockImplementationOnce((async () => {
			markApplyStarted();
			await applyFinished;
			return { reDerived: [] };
		}) as never);
		const emitEvent = vi.fn();
		const lane = createChangeSignalLane({
			manager,
			databaseFor: () => ({ collections: {} }) as never,
			fetcher: vi.fn(),
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			readBlob: async () => JSON.stringify({ cursor: { sequence: 0 }, baselineDigests: [] }),
			writeBlob: vi.fn(),
			connectivity: () => 'online',
			diagnostics: () => undefined,
			emitEvent,
		});

		await lane.tick();
		expect(emitEvent).not.toHaveBeenCalled();

		const changedTick = lane.tick();
		await applyStarted;
		expect(emitEvent).not.toHaveBeenCalled();

		finishApply();
		await changedTick;
		expect(emitEvent).toHaveBeenCalledWith({
			type: 'config-changed',
			collections: ['tax_rates'],
		});
	});
});

describe('hydration-miss recovery accounting', () => {
	/**
	 * The recovery is spent by the change-signal tick's OWN state persist and by
	 * nothing else. The engine's blob seam is shared — the customer trickle stores
	 * its cursor through the same `writeBlob` — so retiring the recovery on any
	 * write through that seam would let an unrelated lane declare a re-pull landed
	 * that this lane never performed, and the barcode-less rows would stay.
	 */
	function laneWith(persist: boolean) {
		const scopeBarcodeSelectors = createScopeBarcodeSelectors();
		const writeBlob = vi.fn(async () => undefined);
		const outcome: HybridPollOutcome = {
			changes: [],
			previousCursor: { sequence: 0 },
			cursor: { sequence: 1 },
			rebaseline: false,
			sweepRan: false,
			sweepIncomplete: false,
			integrityMismatches: [],
			idsToPull: [],
			escalatedIds: [],
			clearedEscalations: [],
			escalationLedger: [],
			baselineDigests: new Map(),
		};
		mocks.poll.mockResolvedValueOnce(outcome);
		vi.mocked(applyReplicationActions).mockImplementationOnce((async (
			_actions: unknown,
			handlers: { persistState: (state: unknown) => Promise<void> }
		) => {
			if (persist)
				await handlers.persistState({
					cursor: { sequence: 1 },
					baselineDigests: new Map(),
					escalations: [],
				});
			return { reDerived: [] };
		}) as never);
		return { scopeBarcodeSelectors, writeBlob, outcome };
	}

	async function runTick(persist: boolean) {
		const manager = new StoreScopeManager({
			createDatabase: async () => stubDatabase(),
		});
		await manager.switchTo('scope-a');
		const { scopeBarcodeSelectors, writeBlob } = laneWith(persist);
		// A scope whose open-time hydration failed, with a recovery already issued.
		scopeBarcodeSelectors.noteHydrationFailed();
		expect(
			scopeBarcodeSelectors.staleCollectionsForRecovery({
				fingerprints: {} as never,
				barcodeFields: { products: ['sku'], variations: ['sku'] } as never,
			})
		).toEqual(['products', 'variations']);

		const lane = createChangeSignalLane({
			manager,
			databaseFor: () => ({ collections: {} }) as never,
			fetcher: vi.fn(),
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			// Restored state: no cold-start head-priming fetch on this tick.
			readBlob: async () => JSON.stringify({ cursor: { sequence: 5 }, baselineDigests: [] }),
			writeBlob,
			connectivity: () => 'online',
			diagnostics: () => undefined,
			emitEvent: () => undefined,
			barcodeSelectorsFor: () => scopeBarcodeSelectors,
		});
		await lane.tick();
		expect(writeBlob.mock.calls.length).toBe(persist ? 1 : 0);

		// Is the recovery still owed? staleCollectionsForRecovery answers [] once spent.
		return scopeBarcodeSelectors.staleCollectionsForRecovery({
			fingerprints: {} as never,
			barcodeFields: { products: ['sku'], variations: ['sku'] } as never,
		});
	}

	it('spends the recovery when the tick persists its own change-signal state', async () => {
		expect(await runTick(true)).toEqual([]);
	});

	it('keeps the recovery owed when the tick never persisted', async () => {
		expect(await runTick(false)).toEqual(['products', 'variations']);
	});
});

describe('cold-start priming', () => {
	/** The head-priming response the engine primes a fresh scope from. */
	function primingFetcher(checkpoint: Record<string, unknown>) {
		return vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ checkpoint }),
		})) as never;
	}

	async function openPrimeLane(blob: string | null = null, offline = false, unauthorized = false) {
		const manager = new StoreScopeManager({ createDatabase: async () => stubDatabase() });
		await manager.switchTo('scope-a');
		const fetcher = unauthorized
			? vi.fn(async () => new Response(null, { status: 401 }))
			: primingFetcher({ head: 40, epoch: 'epoch-FIRST' });
		const writeBlob = vi.fn(async (_scope: string, _key: string, value: string) => {
			blob = value;
		});
		const lane = createChangeSignalLane({
			manager,
			databaseFor: () => ({ collections: {} }) as never,
			fetcher,
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			readBlob: async () => blob,
			writeBlob,
			connectivity: () => (offline ? 'offline' : 'online'),
			diagnostics: () => undefined,
			emitEvent: () => undefined,
		});
		return { lane, fetcher, writeBlob };
	}

	it('primes at open and restores the cursor and epoch on the first tick without another fetch', async () => {
		const { lane, fetcher, writeBlob } = await openPrimeLane();
		expect(await lane.prime()).toEqual({ status: 'primed', head: 40 });
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(fetcher).toHaveBeenCalledWith(
			'https://example.test/wp-json/wcpos/v2/changes/sequence-log?collection=all&since=0&limit=1',
			expect.anything()
		);
		expect(writeBlob).toHaveBeenCalledTimes(1);
		expect(writeBlob.mock.calls[0].slice(0, 2)).toEqual(['scope-a', CHANGE_SIGNAL_STATE_KEY]);
		expect(deserializeChangeSignalState(writeBlob.mock.calls[0][2])).toMatchObject({
			initialCursor: { sequence: 40 },
			epoch: 'epoch-FIRST',
		});
		mocks.poll.mockResolvedValueOnce({
			changes: [],
			cursor: { sequence: 40 },
			rebaseline: false,
			sweepRan: false,
			sweepIncomplete: false,
			integrityMismatches: [],
			idsToPull: [],
			escalatedIds: [],
			clearedEscalations: [],
			escalationLedger: [],
			baselineDigests: new Map(),
		} satisfies HybridPollOutcome);
		expect(await lane.tick()).toMatchObject({ status: 'ran' });
		expect(createHybridChangeSignalEngine).toHaveBeenLastCalledWith(
			expect.objectContaining({
				initialCursor: { sequence: 40 },
				initialEpoch: 'epoch-FIRST',
			})
		);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('restores existing state at open without fetching or writing', async () => {
		const { lane, fetcher, writeBlob } = await openPrimeLane(
			JSON.stringify({ cursor: { sequence: 5 }, baselineDigests: [] })
		);
		expect(await lane.prime()).toEqual({ status: 'restored' });
		expect(fetcher).not.toHaveBeenCalled();
		expect(writeBlob).not.toHaveBeenCalled();
	});

	it('skips priming offline without fetching or writing', async () => {
		const { lane, fetcher, writeBlob } = await openPrimeLane(null, true);
		expect(await lane.prime()).toEqual({ status: 'skipped' });
		expect(fetcher).not.toHaveBeenCalled();
		expect(writeBlob).not.toHaveBeenCalled();
	});

	it('writes nothing when the caller aborted while the head fetch was in flight', async () => {
		// A port that ignores its signal can answer after the facade's deadline
		// passed and bootstrap pulls began; adopting that head would skip them.
		const manager = new StoreScopeManager({ createDatabase: async () => stubDatabase() });
		await manager.switchTo('scope-a');
		const abort = new AbortController();
		const writeBlob = vi.fn(async () => undefined);
		const lane = createChangeSignalLane({
			manager,
			databaseFor: () => ({ collections: {} }) as never,
			fetcher: async () => {
				abort.abort();
				return Response.json({ checkpoint: { head: 40, epoch: 'epoch-FIRST' } });
			},
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			readBlob: async () => null,
			writeBlob,
			connectivity: () => 'online',
			diagnostics: () => undefined,
			emitEvent: () => undefined,
		});
		expect(await lane.prime(abort.signal)).toEqual({ status: 'skipped' });
		expect(writeBlob).not.toHaveBeenCalled();
	});

	it('leaves the lazy first-tick prime intact after a rejected prime', async () => {
		const manager = new StoreScopeManager({ createDatabase: async () => stubDatabase() });
		await manager.switchTo('scope-a');
		let serverUp = false;
		const fetcher = vi.fn(async () =>
			serverUp
				? Response.json({ checkpoint: { head: 40, epoch: 'epoch-FIRST' } })
				: new Response(null, { status: 503 })
		);
		const lane = createChangeSignalLane({
			manager,
			databaseFor: () => ({ collections: {} }) as never,
			fetcher,
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			readBlob: async () => null,
			writeBlob: vi.fn(async () => undefined),
			connectivity: () => 'online',
			diagnostics: () => undefined,
			emitEvent: () => undefined,
		});
		await expect(lane.prime()).rejects.toMatchObject({ status: 503 });
		serverUp = true;
		mocks.poll.mockResolvedValueOnce({
			changes: [],
			cursor: { sequence: 40 },
			rebaseline: false,
			sweepRan: false,
			sweepIncomplete: false,
			integrityMismatches: [],
			idsToPull: [],
			escalatedIds: [],
			clearedEscalations: [],
			escalationLedger: [],
			baselineDigests: new Map(),
		} satisfies HybridPollOutcome);
		expect(await lane.tick()).toMatchObject({ status: 'ran' });
		expect(createHybridChangeSignalEngine).toHaveBeenLastCalledWith(
			expect.objectContaining({ initialCursor: { sequence: 40 }, initialEpoch: 'epoch-FIRST' })
		);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('lets the FIRST of two concurrent openers win the persisted baseline', async () => {
		// Two tabs open one fresh scope; both read "no state" before either
		// writes. Tab A primes at 5 and starts fetching; the server then moves to
		// 6 and tab B's head fetch answers 6. Persisting 6 would skip the change
		// that made A's records stale, so B restores A's baseline instead.
		let blob: string | null = null;
		const store = {
			readBlob: async () => blob,
			writeBlob: vi.fn(async (_scope: string, _key: string, value: string) => {
				blob = value;
			}),
		};
		const deferred = () => {
			let resolve!: (head: number) => void;
			const promise = new Promise<number>((r) => (resolve = r));
			return { promise, resolve };
		};
		const answers = { a: deferred(), b: deferred() };
		const laneFor = async (answer: { promise: Promise<number> }) => {
			const manager = new StoreScopeManager({ createDatabase: async () => stubDatabase() });
			await manager.switchTo('scope-a');
			return createChangeSignalLane({
				manager,
				databaseFor: () => ({ collections: {} }) as never,
				fetcher: async () =>
					Response.json({ checkpoint: { head: await answer.promise, epoch: 'epoch-FIRST' } }),
				syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
				...store,
				connectivity: () => 'online',
				diagnostics: () => undefined,
				emitEvent: () => undefined,
			});
		};
		const tabA = await laneFor(answers.a);
		const tabB = await laneFor(answers.b);
		const primeA = tabA.prime();
		const primeB = tabB.prime();
		// Both head fetches are in flight (both already read null).
		await new Promise((r) => setTimeout(r, 0));
		answers.a.resolve(5);
		expect(await primeA).toEqual({ status: 'primed', head: 5 });
		answers.b.resolve(6);
		expect(await primeB).toEqual({ status: 'restored' });
		expect(store.writeBlob).toHaveBeenCalledTimes(1);
		expect(deserializeChangeSignalState(blob!)).toMatchObject({ initialCursor: { sequence: 5 } });
	});

	it('starts the engine from its own lower prime when a concurrent opener persisted a higher head', async () => {
		// The read/write interleaving the first-writer check cannot see: the
		// other tab's 6 landed AFTER our re-read. Our own 5 is the floor, once.
		let blob: string | null = null;
		const manager = new StoreScopeManager({ createDatabase: async () => stubDatabase() });
		await manager.switchTo('scope-a');
		const lane = createChangeSignalLane({
			manager,
			databaseFor: () => ({ collections: {} }) as never,
			fetcher: primingFetcher({ head: 5, epoch: 'epoch-FIRST' }),
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			readBlob: async () => blob,
			writeBlob: async (_scope, _key, value) => {
				blob = value;
			},
			connectivity: () => 'online',
			diagnostics: () => undefined,
			emitEvent: () => undefined,
		});
		expect(await lane.prime()).toEqual({ status: 'primed', head: 5 });
		// The other tab's later prime lands over ours.
		blob = JSON.stringify({ cursor: { sequence: 6 }, baselineDigests: [], epoch: 'epoch-FIRST' });
		mocks.poll.mockResolvedValueOnce({
			changes: [],
			cursor: { sequence: 5 },
			rebaseline: false,
			sweepRan: false,
			sweepIncomplete: false,
			integrityMismatches: [],
			idsToPull: [],
			escalatedIds: [],
			clearedEscalations: [],
			escalationLedger: [],
			baselineDigests: new Map(),
		} satisfies HybridPollOutcome);
		expect(await lane.tick()).toMatchObject({ status: 'ran' });
		expect(createHybridChangeSignalEngine).toHaveBeenLastCalledWith(
			expect.objectContaining({ initialCursor: { sequence: 5 }, initialEpoch: 'epoch-FIRST' })
		);
		// A tick that fails AFTER its poll is pruned and rebuilt (commit-only-on-
		// success): the rebuilt engine must find the floor still in place, or the
		// retry would restore the other tab's 6 and skip 5..6 after all.
		mocks.poll.mockResolvedValueOnce({
			changes: [],
			cursor: { sequence: 6 },
			rebaseline: false,
			sweepRan: false,
			sweepIncomplete: false,
			integrityMismatches: [],
			idsToPull: [],
			escalatedIds: [],
			clearedEscalations: [],
			escalationLedger: [],
			baselineDigests: new Map(),
		} satisfies HybridPollOutcome);
		vi.mocked(applyReplicationActions).mockRejectedValueOnce(new Error('pull 500'));
		expect(await lane.tick()).toMatchObject({ status: 'error' });
		mocks.poll.mockResolvedValueOnce({
			changes: [],
			cursor: { sequence: 6 },
			rebaseline: false,
			sweepRan: false,
			sweepIncomplete: false,
			integrityMismatches: [],
			idsToPull: [],
			escalatedIds: [],
			clearedEscalations: [],
			escalationLedger: [],
			baselineDigests: new Map(),
		} satisfies HybridPollOutcome);
		// This tick commits — persistState runs — and the floor is released.
		vi.mocked(applyReplicationActions).mockImplementationOnce(async (_actions, handlers) => {
			await handlers.persistState({
				cursor: { sequence: 6 },
				baselineDigests: new Map(),
				escalations: [],
				epoch: 'epoch-FIRST',
			} as never);
			return { reDerived: [] } as never;
		});
		expect(await lane.tick()).toMatchObject({ status: 'ran' });
		expect(createHybridChangeSignalEngine).toHaveBeenLastCalledWith(
			expect.objectContaining({ initialCursor: { sequence: 5 } })
		);
		lane.prune('scope-a');
		mocks.poll.mockResolvedValueOnce({
			changes: [],
			cursor: { sequence: 6 },
			rebaseline: false,
			sweepRan: false,
			sweepIncomplete: false,
			integrityMismatches: [],
			idsToPull: [],
			escalatedIds: [],
			clearedEscalations: [],
			escalationLedger: [],
			baselineDigests: new Map(),
		} satisfies HybridPollOutcome);
		expect(await lane.tick()).toMatchObject({ status: 'ran' });
		expect(createHybridChangeSignalEngine).toHaveBeenLastCalledWith(
			expect.objectContaining({ initialCursor: { sequence: 6 } })
		);
	});

	it('releases the lane chain when a hung checkpoint read is aborted', async () => {
		// A host checkpoint port that never settles must not leave every later
		// tick queued behind the prime once the facade's deadline has passed.
		const manager = new StoreScopeManager({ createDatabase: async () => stubDatabase() });
		await manager.switchTo('scope-a');
		let reads = 0;
		const lane = createChangeSignalLane({
			manager,
			databaseFor: () => ({ collections: {} }) as never,
			fetcher: primingFetcher({ head: 40, epoch: 'epoch-FIRST' }),
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			readBlob: () => (reads++ === 0 ? new Promise<never>(() => undefined) : Promise.resolve(null)),
			writeBlob: vi.fn(async () => undefined),
			connectivity: () => 'online',
			diagnostics: () => undefined,
			emitEvent: () => undefined,
		});
		const abort = new AbortController();
		void lane.prime(abort.signal);
		// Let the prime reach its (hung) checkpoint read before the deadline fires.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(reads).toBe(1);
		abort.abort();
		mocks.poll.mockResolvedValueOnce({
			changes: [],
			cursor: { sequence: 40 },
			rebaseline: false,
			sweepRan: false,
			sweepIncomplete: false,
			integrityMismatches: [],
			idsToPull: [],
			escalatedIds: [],
			clearedEscalations: [],
			escalationLedger: [],
			baselineDigests: new Map(),
		} satisfies HybridPollOutcome);
		const outcome = await Promise.race([
			lane.tick(),
			new Promise<'wedged'>((resolve) => setTimeout(() => resolve('wedged'), 500)),
		]);
		expect(outcome).toMatchObject({ status: 'ran' });
	});

	it('drops the prime write when the scope moved during the head fetch', async () => {
		const manager = new StoreScopeManager({ createDatabase: async () => stubDatabase() });
		await manager.switchTo('scope-a');
		const writeBlob = vi.fn(async () => undefined);
		const lane = createChangeSignalLane({
			manager,
			databaseFor: () => ({ collections: {} }) as never,
			fetcher: async () => {
				await manager.switchTo('scope-b');
				return Response.json({ checkpoint: { head: 40 } });
			},
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			readBlob: async () => null,
			writeBlob,
			connectivity: () => 'online',
			diagnostics: () => undefined,
			emitEvent: () => undefined,
		});
		expect(await lane.prime()).toEqual({ status: 'skipped' });
		expect(writeBlob).not.toHaveBeenCalled();
	});

	it('an aborted prime queued behind an in-flight tick still waits for that tick', async () => {
		// Releasing the chain must skip only the prime's OWN run: an abort during
		// a slow tick must not let the next tick start beside it (they share the
		// lane's rebindable fetch and engine state).
		const manager = new StoreScopeManager({ createDatabase: async () => stubDatabase() });
		await manager.switchTo('scope-a');
		const lane = createChangeSignalLane({
			manager,
			databaseFor: () => ({ collections: {} }) as never,
			fetcher: primingFetcher({ head: 40, epoch: 'epoch-FIRST' }),
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			readBlob: async () => null,
			writeBlob: vi.fn(async () => undefined),
			connectivity: () => 'online',
			diagnostics: () => undefined,
			emitEvent: () => undefined,
		});
		const outcome = {
			changes: [],
			cursor: { sequence: 40 },
			rebaseline: false,
			sweepRan: false,
			sweepIncomplete: false,
			integrityMismatches: [],
			idsToPull: [],
			escalatedIds: [],
			clearedEscalations: [],
			escalationLedger: [],
			baselineDigests: new Map(),
		} satisfies HybridPollOutcome;
		let finishFirstPoll!: () => void;
		mocks.poll.mockImplementationOnce(
			() =>
				new Promise<HybridPollOutcome>((resolve) => {
					finishFirstPoll = () => resolve(outcome);
				})
		);
		mocks.poll.mockResolvedValueOnce(outcome);
		const pollsBefore = mocks.poll.mock.calls.length;
		const first = lane.tick();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(mocks.poll).toHaveBeenCalledTimes(pollsBefore + 1);
		const abort = new AbortController();
		void lane.prime(abort.signal);
		abort.abort();
		const second = lane.tick();
		await new Promise((resolve) => setTimeout(resolve, 20));
		// The first tick is still inside its poll; the second must not have started.
		expect(mocks.poll).toHaveBeenCalledTimes(pollsBefore + 1);
		finishFirstPoll();
		expect(await first).toMatchObject({ status: 'ran' });
		expect(await second).toMatchObject({ status: 'ran' });
		expect(mocks.poll).toHaveBeenCalledTimes(pollsBefore + 2);
	});

	it('keeps the chain waiting once the prime write has begun, abort or not', async () => {
		// A slow checkpoint port: the write is in flight when the deadline fires.
		// The next tick must not run (and persist) beside it, or the late prime
		// write would replace the tick's cursor and baselines with the empty prime.
		const manager = new StoreScopeManager({ createDatabase: async () => stubDatabase() });
		await manager.switchTo('scope-a');
		let finishWrite!: () => void;
		let blob: string | null = null;
		const lane = createChangeSignalLane({
			manager,
			databaseFor: () => ({ collections: {} }) as never,
			fetcher: primingFetcher({ head: 40, epoch: 'epoch-FIRST' }),
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			readBlob: async () => blob,
			writeBlob: (_scope, _key, value) =>
				new Promise<void>((resolve) => {
					finishWrite = () => {
						blob = value;
						resolve();
					};
				}),
			connectivity: () => 'online',
			diagnostics: () => undefined,
			emitEvent: () => undefined,
		});
		const abort = new AbortController();
		const prime = lane.prime(abort.signal);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(finishWrite).toBeDefined();
		abort.abort();
		mocks.poll.mockResolvedValueOnce({
			changes: [],
			cursor: { sequence: 40 },
			rebaseline: false,
			sweepRan: false,
			sweepIncomplete: false,
			integrityMismatches: [],
			idsToPull: [],
			escalatedIds: [],
			clearedEscalations: [],
			escalationLedger: [],
			baselineDigests: new Map(),
		} satisfies HybridPollOutcome);
		const pollsBefore = mocks.poll.mock.calls.length;
		const tick = lane.tick();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(mocks.poll).toHaveBeenCalledTimes(pollsBefore);
		finishWrite();
		expect(await prime).toEqual({ status: 'primed', head: 40 });
		expect(await tick).toMatchObject({ status: 'ran' });
		expect(mocks.poll).toHaveBeenCalledTimes(pollsBefore + 1);
	});

	it('writes nothing when the abort landed during the cross-instance re-read', async () => {
		// The re-read is the last await before the write. An abort during it has
		// already released the chain (nothing is being written yet), so a tick may
		// have persisted by the time the read answers — the prime must stand down.
		const manager = new StoreScopeManager({ createDatabase: async () => stubDatabase() });
		await manager.switchTo('scope-a');
		let reads = 0;
		let answerReRead!: () => void;
		const writeBlob = vi.fn(async () => undefined);
		const lane = createChangeSignalLane({
			manager,
			databaseFor: () => ({ collections: {} }) as never,
			fetcher: primingFetcher({ head: 40, epoch: 'epoch-FIRST' }),
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			readBlob: () =>
				reads++ === 0
					? Promise.resolve(null)
					: new Promise<null>((resolve) => {
							answerReRead = () => resolve(null);
						}),
			writeBlob,
			connectivity: () => 'online',
			diagnostics: () => undefined,
			emitEvent: () => undefined,
		});
		const abort = new AbortController();
		const prime = lane.prime(abort.signal);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(reads).toBe(2);
		abort.abort();
		answerReRead();
		expect(await prime).toEqual({ status: 'skipped' });
		expect(writeBlob).not.toHaveBeenCalled();
	});

	it('installs no floor from a raced checkpoint once the abort has landed', async () => {
		// The chain was released during the re-read and a tick persisted 6. The
		// stale prime must not leave its old head as a floor, or a later failed
		// tick would rewind the rebuilt engine to it.
		const manager = new StoreScopeManager({ createDatabase: async () => stubDatabase() });
		await manager.switchTo('scope-a');
		let reads = 0;
		let answerReRead!: () => void;
		const persisted = JSON.stringify({
			cursor: { sequence: 6 },
			baselineDigests: [],
			epoch: 'epoch-FIRST',
		});
		const lane = createChangeSignalLane({
			manager,
			databaseFor: () => ({ collections: {} }) as never,
			fetcher: primingFetcher({ head: 5, epoch: 'epoch-FIRST' }),
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			readBlob: () => {
				const call = reads++;
				if (call === 0) return Promise.resolve(null);
				if (call === 1)
					return new Promise<string>((resolve) => {
						answerReRead = () => resolve(persisted);
					});
				return Promise.resolve(persisted);
			},
			writeBlob: vi.fn(async () => undefined),
			connectivity: () => 'online',
			diagnostics: () => undefined,
			emitEvent: () => undefined,
		});
		const abort = new AbortController();
		const prime = lane.prime(abort.signal);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(reads).toBe(2);
		abort.abort();
		answerReRead();
		expect(await prime).toEqual({ status: 'skipped' });
		mocks.poll.mockResolvedValueOnce({
			changes: [],
			cursor: { sequence: 6 },
			rebaseline: false,
			sweepRan: false,
			sweepIncomplete: false,
			integrityMismatches: [],
			idsToPull: [],
			escalatedIds: [],
			clearedEscalations: [],
			escalationLedger: [],
			baselineDigests: new Map(),
		} satisfies HybridPollOutcome);
		expect(await lane.tick()).toMatchObject({ status: 'ran' });
		expect(createHybridChangeSignalEngine).toHaveBeenLastCalledWith(
			expect.objectContaining({ initialCursor: { sequence: 6 } })
		);
	});

	it('rejects a 401 prime with the poison error and writes nothing', async () => {
		const { lane, writeBlob } = await openPrimeLane(null, false, true);
		const prime = lane.prime();
		await expect(prime).rejects.toBeInstanceOf(ChangeSignalPoisonError);
		await expect(prime).rejects.toMatchObject({ status: 401 });
		expect(writeBlob).not.toHaveBeenCalled();
	});

	async function primeScope(checkpoint: Record<string, unknown>) {
		const manager = new StoreScopeManager({
			createDatabase: async () => stubDatabase(),
		});
		await manager.switchTo('scope-a');
		mocks.poll.mockResolvedValueOnce({
			changes: [],
			cursor: { sequence: 40 },
			rebaseline: false,
			sweepRan: false,
			sweepIncomplete: false,
			integrityMismatches: [],
			idsToPull: [],
			escalatedIds: [],
			clearedEscalations: [],
			escalationLedger: [],
			baselineDigests: new Map(),
		} as HybridPollOutcome);
		vi.mocked(createHybridChangeSignalEngine).mockClear();
		const lane = createChangeSignalLane({
			manager,
			databaseFor: () => ({ collections: {} }) as never,
			fetcher: primingFetcher(checkpoint),
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			// No stored state: this tick primes from the server's head.
			readBlob: async () => null,
			writeBlob: vi.fn(async () => undefined),
			connectivity: () => 'online',
			diagnostics: () => undefined,
			emitEvent: () => undefined,
		});
		await lane.tick();
		return vi.mocked(createHybridChangeSignalEngine).mock.calls[0]?.[0] as {
			initialCursor: { sequence: number };
			initialEpoch?: string;
		};
	}

	it('primes the cursor WITH the generation that head belongs to', async () => {
		// Without the epoch, the engine cannot prove its own primed cursor and
		// rebaselines the whole catalogue on the first poll (free#1560 review).
		const input = await primeScope({ head: 40, epoch: 'epoch-FIRST', horizon: 0 });

		expect(input.initialCursor).toEqual({ sequence: 40 });
		expect(input.initialEpoch).toBe('epoch-FIRST');
	});

	it('primes without an epoch when the server names none', async () => {
		const input = await primeScope({ head: 40 });

		expect(input.initialCursor).toEqual({ sequence: 40 });
		expect(input.initialEpoch).toBeUndefined();
	});
});

describe('census expiry on applied changes', () => {
	/** In-memory queryTotalCacheEntries — enough of find/findOne/incrementalModify for expire(). */
	function censusDatabase(seed: QueryTotalCacheEntry[], failWrites = false, failWriteFor?: string) {
		const byKey = new Map(
			seed.map((entry) => [entry.queryKey, { ...entry, schemaVersion: 1 as const }])
		);
		return {
			byKey,
			database: {
				collections: {},
				queryTotalCacheEntries: {
					find: (query?: { selector?: { queryKey?: { $in?: string[] } } }) => ({
						exec: async () => {
							const requested = query?.selector?.queryKey?.$in;
							return [...byKey.values()].filter(
								(document) => requested === undefined || requested.includes(document.queryKey)
							);
						},
					}),
					bulkUpsert: async (documents: (QueryTotalCacheEntry & { schemaVersion: 1 })[]) => {
						if (failWrites || documents.some(({ queryKey }) => queryKey === failWriteFor)) {
							throw new Error('cache write refused');
						}
						for (const document of documents) byKey.set(document.queryKey, document);
						return { success: documents, error: [] };
					},
					findOne: (queryKey: string) => ({
						exec: async () => {
							const stored = byKey.get(queryKey);
							if (!stored) return null;
							return {
								toJSON: () => stored,
								incrementalModify: async (
									modify: (
										document: QueryTotalCacheEntry & { schemaVersion: 1 }
									) => QueryTotalCacheEntry & { schemaVersion: 1 }
								) => {
									if (failWrites || queryKey === failWriteFor) {
										throw new Error('cache write refused');
									}
									const current = byKey.get(queryKey);
									if (current) byKey.set(queryKey, modify(current));
								},
							};
						},
					}),
				},
			} as never,
		};
	}

	function censusEntry(queryKey: string): QueryTotalCacheEntry {
		return { queryKey, totalMatchingRecords: 203, freshUntilMs: 900_000, updatedAtMs: 1_000 };
	}

	async function runCensusTick(options: {
		plan: Partial<{
			targetedPulls: { collection: string; ids: number[] }[];
			deletes: { collection: string; ids: number[] }[];
			rebaselineCollections: string[];
			reFetchCollections: string[];
			reDeriveBarcode: { collection: string; activeFields: string[] }[];
		}>;
		seed: QueryTotalCacheEntry[];
		failWrites?: boolean;
		failWriteFor?: string;
		reDerived?: { collection: string; rederived: boolean }[];
	}) {
		const manager = new StoreScopeManager({
			createDatabase: async () => stubDatabase(),
		});
		await manager.switchTo('scope-a');
		const outcome: HybridPollOutcome = {
			changes: [],
			previousCursor: { sequence: 0 },
			cursor: { sequence: 1 },
			rebaseline: false,
			sweepRan: false,
			sweepIncomplete: false,
			integrityMismatches: [],
			idsToPull: [],
			escalatedIds: [],
			clearedEscalations: [],
			escalationLedger: [],
			baselineDigests: new Map(),
		};
		mocks.poll.mockResolvedValueOnce(outcome);
		const { planReplicationActions } = await import('@wcpos/sync-core');
		vi.mocked(planReplicationActions).mockReturnValueOnce({
			targetedPulls: [],
			deletes: [],
			rebaselineCollections: [],
			reFetchCollections: [],
			...options.plan,
		} as never);
		vi.mocked(applyReplicationActions).mockResolvedValueOnce({
			reDerived: options.reDerived ?? [],
		} as never);
		const { byKey, database } = censusDatabase(
			options.seed,
			options.failWrites ?? false,
			options.failWriteFor
		);
		const emitEvent = vi.fn();
		const diagnostics = vi.fn();
		const lane = createChangeSignalLane({
			manager,
			databaseFor: () => database,
			fetcher: vi.fn(),
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			readBlob: async () => JSON.stringify({ cursor: { sequence: 0 }, baselineDigests: [] }),
			writeBlob: vi.fn(),
			connectivity: () => 'online',
			diagnostics,
			emitEvent,
			now: () => 5_000,
		});
		const report = await lane.tick();
		return { report, byKey, emitEvent, diagnostics };
	}

	it('expires the touched collections (hybrid names mapped) and emits the rewritten entries', async () => {
		const { byKey, emitEvent } = await runCensusTick({
			plan: {
				targetedPulls: [{ collection: 'products', ids: [7] }],
				deletes: [{ collection: 'tax_rates', ids: [3] }],
			},
			seed: [
				censusEntry('census:products'),
				censusEntry('census:taxRates'),
				censusEntry('census:customers'),
			],
		});
		expect(byKey.get('census:products')?.freshUntilMs).toBe(5_000);
		expect(byKey.get('census:taxRates')?.freshUntilMs).toBe(5_000);
		// Untouched collections keep their freshness window.
		expect(byKey.get('census:customers')?.freshUntilMs).toBe(900_000);
		expect(emitEvent).toHaveBeenCalledWith({
			type: 'query-total-cache',
			entries: [
				expect.objectContaining({ queryKey: 'census:products', freshUntilMs: 5_000 }),
				expect.objectContaining({ queryKey: 'census:taxRates', freshUntilMs: 5_000 }),
			],
		});
	});

	it('expires nothing and emits nothing when the plan carried no population changes', async () => {
		const { byKey, emitEvent } = await runCensusTick({
			plan: { targetedPulls: [{ collection: 'products', ids: [] }] },
			seed: [censusEntry('census:products')],
		});
		expect(byKey.get('census:products')?.freshUntilMs).toBe(900_000);
		expect(emitEvent).not.toHaveBeenCalled();
	});

	it('expires a collection when barcode re-derive falls back to a full re-fetch', async () => {
		const { byKey, emitEvent } = await runCensusTick({
			plan: {
				reDeriveBarcode: [{ collection: 'products', activeFields: ['global_unique_id'] }],
			},
			reDerived: [{ collection: 'products', rederived: false }],
			seed: [censusEntry('census:products')],
		});

		expect(byKey.get('census:products')?.freshUntilMs).toBe(5_000);
		expect(emitEvent).toHaveBeenCalledWith({
			type: 'query-total-cache',
			entries: [expect.objectContaining({ queryKey: 'census:products', freshUntilMs: 5_000 })],
		});
	});

	it('keeps the tick ran when the expiry write fails, and only warns', async () => {
		const { report, emitEvent, diagnostics } = await runCensusTick({
			plan: { targetedPulls: [{ collection: 'products', ids: [7] }] },
			seed: [censusEntry('census:products')],
			failWrites: true,
		});
		expect(report.status).toBe('ran');
		expect(emitEvent).not.toHaveBeenCalled();
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'signal.log',
				level: 'warn',
				message: expect.stringContaining('census expiry'),
			})
		);
	});

	it('emits completed expiries and identifies a later entry whose write fails', async () => {
		const { byKey, emitEvent, diagnostics } = await runCensusTick({
			plan: {
				targetedPulls: [{ collection: 'products', ids: [7] }],
				deletes: [{ collection: 'tax_rates', ids: [3] }],
			},
			seed: [censusEntry('census:products'), censusEntry('census:taxRates')],
			failWriteFor: 'census:taxRates',
		});

		expect(byKey.get('census:products')?.freshUntilMs).toBe(5_000);
		expect(byKey.get('census:taxRates')?.freshUntilMs).toBe(900_000);
		expect(emitEvent).toHaveBeenCalledWith({
			type: 'query-total-cache',
			entries: [expect.objectContaining({ queryKey: 'census:products', freshUntilMs: 5_000 })],
		});
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'signal.log',
				level: 'warn',
				message: expect.stringContaining('census:taxRates'),
			})
		);
	});
});
