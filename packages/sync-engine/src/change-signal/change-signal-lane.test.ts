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
import { createChangeSignalLane } from './change-signal-lane';

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
