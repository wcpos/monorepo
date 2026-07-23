// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import { RxSchedulerTaskStateRepository } from './rx-scheduler-task-state-repository';
import {
	type SchedulerTaskStateDocument,
	schedulerTaskStateKey,
	schedulerTaskStateMigrationStrategies,
	schedulerTaskStateSchema,
} from './scheduler-task-state-schema';

import type { PersistedSchedulerTaskState } from './persisted-scheduler-state';

addRxPlugin(RxDBMigrationSchemaPlugin);

/**
 * These tests run against REAL RxDB storage wrapped with the z-schema validator —
 * the exact dev-mode recipe the app uses (packages/database adapters). Unlike Ajv
 * (which `memoryEngineStorage` uses and which treats a present-but-`undefined` key
 * as absent), z-schema type-checks the key's value, so `{ ids: undefined }` fails
 * VD2 with "Expected type array but found type undefined" — the production bug
 * this file pins down.
 */

let dbCounter = 0;
async function taskStateRepository() {
	dbCounter += 1;
	const db = await createRxDatabase({
		name: `taskstatedevvalidation${dbCounter}`,
		storage: wrappedValidateZSchemaStorage({ storage: getRxStorageMemory() }),
	});
	await db.addCollections({
		schedulerTaskStates: {
			schema: schedulerTaskStateSchema,
			migrationStrategies: schedulerTaskStateMigrationStrategies,
		},
	});
	const collection = db.schedulerTaskStates;
	const repository = new RxSchedulerTaskStateRepository(
		db as unknown as ConstructorParameters<typeof RxSchedulerTaskStateRepository>[0]
	);
	async function storedJson(taskId: string): Promise<SchedulerTaskStateDocument | null> {
		const document = await collection.findOne(schedulerTaskStateKey(taskId)).exec();
		return document ? (document.toJSON() as SchedulerTaskStateDocument) : null;
	}
	return { repository, storedJson };
}

/** A lane (non-targeted) task exactly as `toQueuedState` builds it: the optional
 * `ids`/`wooIds` keys are PRESENT with value `undefined`. */
function laneTaskState(
	overrides: Partial<PersistedSchedulerTaskState> = {}
): PersistedSchedulerTaskState {
	return {
		taskId: 'orders:orders:open:windowed',
		requirementId: 'orders.open',
		collection: 'orders',
		queryKey: 'orders:open',
		ids: undefined,
		wooIds: undefined,
		limit: 25,
		priority: 600,
		mode: 'windowed',
		status: 'queued',
		ownerId: null,
		claimedUntilMs: null,
		attempt: 0,
		retryAfterMs: null,
		updatedAtMs: 1_000,
		...overrides,
	};
}

describe('scheduler task state repository under dev-mode (z-schema) validation', () => {
	it('claimNew inserts a lane task whose ids/wooIds are explicitly undefined (VD2 repro)', async () => {
		const { repository, storedJson } = await taskStateRepository();

		await expect(repository.claimNew(laneTaskState())).resolves.toBe(true);

		const stored = await storedJson('orders:orders:open:windowed');
		expect(stored).not.toBeNull();
		// The optional keys must be ABSENT in storage, not `undefined` — z-schema
		// rejects present-but-undefined, and absence is load-bearing downstream
		// (migrateSchedulerTaskStateV4 + the sameSchedulerTaskState CAS compare).
		expect(Object.keys(stored!)).not.toContain('ids');
		expect(Object.keys(stored!)).not.toContain('wooIds');
		expect(Object.keys(stored!)).not.toContain('rerunRequested');
	});

	it('upsert of a lane task passes validation and round-trips with ids/wooIds absent', async () => {
		const { repository } = await taskStateRepository();

		await repository.upsert(laneTaskState({ status: 'failed', retryAfterMs: 5_000, attempt: 2 }));

		const [state] = await repository.readForTaskIds(['orders:orders:open:windowed']);
		expect(state).toBeDefined();
		expect(state.ids).toBeUndefined();
		expect(state.wooIds).toBeUndefined();
		expect(state.status).toBe('failed');
	});

	it('a targeted task keeps its ids/wooIds arrays intact through insert + read', async () => {
		const { repository, storedJson } = await taskStateRepository();
		const targeted = laneTaskState({
			taskId: 'products:targeted:1',
			requirementId: 'products.targeted',
			collection: 'products',
			queryKey: 'products:targeted',
			ids: ['uuid-a', 'uuid-b'],
			wooIds: [101, 102],
			mode: 'on-demand',
		});

		await expect(repository.claimNew(targeted)).resolves.toBe(true);

		const stored = await storedJson('products:targeted:1');
		expect(stored?.ids).toEqual(['uuid-a', 'uuid-b']);
		expect(stored?.wooIds).toEqual([101, 102]);

		const [state] = await repository.readForTaskIds(['products:targeted:1']);
		expect(state.ids).toEqual(['uuid-a', 'uuid-b']);
		expect(state.wooIds).toEqual([101, 102]);
	});

	it('the incrementalModify write paths also pass validation for lane tasks', async () => {
		const { repository, storedJson } = await taskStateRepository();
		const completed = laneTaskState({ status: 'completed', updatedAtMs: 1_000 });
		await repository.upsert(completed);

		// Seeder-side coalescing: re-seed a completed lane task (writes via toDocument
		// inside incrementalModify — the other insert-shaped write path).
		const reseeded = laneTaskState({ status: 'queued', updatedAtMs: 2_000 });
		await expect(repository.requestRerunOrReseed(completed, reseeded, 2_000)).resolves.toBe(
			'requeued'
		);

		const stored = await storedJson('orders:orders:open:windowed');
		expect(stored?.status).toBe('queued');
		expect(Object.keys(stored!)).not.toContain('ids');
		expect(Object.keys(stored!)).not.toContain('wooIds');
	});

	it('the in-flight rerun-requested write path also passes validation for lane tasks', async () => {
		const { repository, storedJson } = await taskStateRepository();
		// Claim an in-flight lane task whose ids/wooIds are explicitly undefined on the
		// source state (as toQueuedState/lane states arrive).
		const inFlight = laneTaskState({ status: 'in-flight', ownerId: 'tab-a', claimedUntilMs: 5_000 });
		await repository.claimNew(inFlight);

		// Seeder-side coalescing: a change arrives while the lease is still valid (nowMs <
		// claimedUntilMs) → flag the in-flight row for rerun. This rewrites the doc via the
		// in-flight branch, which must strip the present-but-undefined ids/wooIds keys the
		// same way toDocument does, or z-schema throws VD2 on the rewrite (#318).
		const reseeded = laneTaskState({ status: 'queued', updatedAtMs: 2_000 });
		await expect(repository.requestRerunOrReseed(inFlight, reseeded, 1_000)).resolves.toBe(
			'rerun-requested'
		);

		const stored = await storedJson('orders:orders:open:windowed');
		expect(stored?.status).toBe('in-flight');
		expect(stored?.rerunRequested).toBe(true);
		expect(Object.keys(stored!)).not.toContain('ids');
		expect(Object.keys(stored!)).not.toContain('wooIds');
	});
});
