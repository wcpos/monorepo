import { describe, expect, it, vi } from 'vitest';

import {
	applyReplicationActions,
	type HybridPollOutcome,
	type ScopeDatabase,
	StoreScopeManager,
	type SyncEvent,
} from '@wcpos/sync-core';

import { createScopeBarcodeSelectors } from '../materialization/barcode-selectors';
import { createChangeSignalLane } from './change-signal-lane';

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
		})),
		applyReplicationActions: vi.fn(async () => undefined),
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
		const manager = new StoreScopeManager({ createDatabase: async () => stubDatabase() });
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
		});

		await lane.tick();

		expect(events.filter((event) => event.type === 'signal.cursor')).toEqual([
			expect.objectContaining({
				level: 'warn',
				fields: expect.objectContaining({ reason: 'backwards', from: 5, to: 0 }),
			}),
		]);
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
			baselineDigests: new Map(),
		};
		mocks.poll.mockResolvedValueOnce(outcome);
		// The module mock resolves undefined; this override only needs to reach
		// persistState, so its (unused) result is cast rather than reconstructed.
		vi.mocked(applyReplicationActions).mockImplementationOnce((async (
			_actions: unknown,
			handlers: { persistState: (state: unknown) => Promise<void> }
		) => {
			if (persist)
				await handlers.persistState({ cursor: { sequence: 1 }, baselineDigests: new Map() });
		}) as never);
		return { scopeBarcodeSelectors, writeBlob, outcome };
	}

	async function runTick(persist: boolean) {
		const manager = new StoreScopeManager({ createDatabase: async () => stubDatabase() });
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
