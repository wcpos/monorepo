import { describe, expect, it, vi } from 'vitest';

import {
	type HybridPollOutcome,
	type ScopeDatabase,
	StoreScopeManager,
	type SyncEvent,
} from '@wcpos/sync-core';

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
