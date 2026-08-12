// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { engineCollectionCreators } from '../collections/engine-collections';
import { createLocalCoverage } from '../local-coverage/local-coverage';
import { runEngineSchedulerDrain } from './engine-scheduler-drain';
import { seedProductBrowseWindowSchedulerTask } from './rx-scheduler-product-task-seeder';
import { RxSchedulerTaskStateRepository } from './rx-scheduler-task-state-repository';

setPremiumFlag();
addRxPlugin(RxDBMigrationSchemaPlugin);

let database: RxDatabase | undefined;

afterEach(async () => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	await database?.close();
	database = undefined;
});

describe('engine scheduler drain clock', () => {
	it('uses the live injected clock when a heartbeat renews the claim', async () => {
		database = await createRxDatabase({
			name: 'engineschedulerdrainclock',
			storage: getRxStorageMemory(),
			multiInstance: false,
		});
		await database.addCollections(engineCollectionCreators() as never);
		const coverage = createLocalCoverage({
			database: database as never,
			now: () => 1_000,
			freshForMs: 500,
		});
		await seedProductBrowseWindowSchedulerTask({
			database: database as never,
			limit: 25,
			nowMs: 1_000,
		});

		const claim = vi.spyOn(RxSchedulerTaskStateRepository.prototype, 'claim');
		let fetchStarted: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			fetchStarted = resolve;
		});
		const fetcher = vi.fn(
			(_url: string, init?: { signal?: AbortSignal }) =>
				new Promise<Response>((_resolve, reject) => {
					fetchStarted?.();
					init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
						once: true,
					});
				})
		);
		const abortController = new AbortController();
		let liveNowMs = 1_000;

		vi.useFakeTimers();
		const run = runEngineSchedulerDrain({
			db: database as never,
			coverage,
			baseUrl: 'https://clock.example.test',
			ownerId: 'tab-a',
			fetcher,
			signal: abortController.signal,
			nowMs: liveNowMs,
			now: () => liveNowMs,
		});
		await started;

		liveNowMs = 11_000;
		await vi.advanceTimersByTimeAsync(10_000);
		expect(claim).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ claimedUntilMs: 31_000 }),
			expect.objectContaining({ claimedUntilMs: 41_000, updatedAtMs: 11_000 })
		);

		abortController.abort(new Error('test complete'));
		await expect(run).rejects.toThrow('test complete');
	});
});
