/**
 * #3243: the boot-only `taxRates:all` reference lane is removed by coverage compaction once it is
 * stale beyond COVERAGE_COMPACTION_RETAIN_STALE_FOR_MS, so the reference verdict drops to
 * complete:false, while the collection's coverageGeneration stays put. The settlement
 * coordinator's per-generation rates latch relies on both halves.
 *
 * Real: createRxdbSyncEngine, memory storage, the coverage hub, the real coverage-compaction lane.
 * Faked: the clock (ports.now) and the lane row (written as the boot tax-rate pull leaves it).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createRxdbSyncEngine, type EngineFetcher } from './create-rxdb-sync-engine';
import { coverageLaneKey } from './local-coverage/local-coverage';
import { laneKeyFor } from './scheduler';
import { memoryEngineStorage } from './testing';

import type { CoverageVerdict } from './local-coverage/coverage-verdicts';

setPremiumFlag();
afterEach(() => vi.useRealTimers());

const SITE = 'https://lab.example.test';
const stubFetcher: EngineFetcher = async () => {
	throw new Error('no network in this test');
};

describe('taxRates reference coverage over time', () => {
	it('compaction removes the taxRates lane and keeps the generation', async () => {
		const T0 = 1_000_000_000;
		let clock = T0;
		const engine = createRxdbSyncEngine(
			{
				site: { syncBaseUrl: `${SITE}/wp-json/wcpos/v2`, wpJsonRoot: `${SITE}/wp-json` },
				storage: memoryEngineStorage(),
				fetcher: stubFetcher,
				mode: 'manual',
				now: () => clock,
			},
			{ site: SITE, storeId: 5, cashierId: 'taxrates-compaction' }
		);
		await engine.ready;
		const scope = engine.active();
		if (!scope) throw new Error('no active scope');
		const queryKey = laneKeyFor('taxRates');
		if (!queryKey) throw new Error('no taxRates lane key');
		// The boot pull's lane: complete, fresh for the default 5 minutes.
		await (
			scope.database.collections.coverageLanes as never as {
				upsert(d: Record<string, unknown>): Promise<unknown>;
			}
		).upsert({
			laneKey: coverageLaneKey('taxRates', queryKey),
			collectionName: 'taxRates',
			queryKey,
			complete: true,
			expectedRecordIds: ['r1', 'r2'],
			freshUntilMs: T0 + 5 * 60_000,
			updatedAtMs: T0,
			schemaVersion: 3,
		});
		const generation = engine.status().collections.taxRates.coverageGeneration;
		const verdicts: CoverageVerdict[] = [];
		const stop = engine.coverageChanges({ collection: 'taxRates', lane: 'reference' }, (v) =>
			verdicts.push(v)
		);
		try {
			await vi.waitFor(() => expect(verdicts.at(-1)?.source).toBe('lane'));
			expect(verdicts.at(-1)?.complete).toBe(true);

			// 3 minutes in: compaction keeps the fresh lane.
			clock = T0 + 3 * 60_000;
			await engine.sync('coverage-compaction');
			expect(verdicts.at(-1)?.complete).toBe(true);

			// 16 minutes in: stale for 11 minutes, beyond the 5-minute retention.
			clock = T0 + 16 * 60_000;
			await engine.sync('coverage-compaction');
			await vi.waitFor(() => expect(verdicts.at(-1)?.complete).toBe(false));
			expect(engine.status().collections.taxRates.coverageGeneration).toBe(generation);
		} finally {
			stop();
			await engine.dispose();
		}
	});
});
