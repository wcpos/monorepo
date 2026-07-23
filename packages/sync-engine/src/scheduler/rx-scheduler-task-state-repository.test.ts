// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
	type SchedulerTaskStateDocument,
	schedulerTaskStateKey,
	schedulerTaskStateSchema,
} from '@wcpos/sync-engine/testing';

import { RxSchedulerTaskStateRepository } from './rx-scheduler-task-state-repository';

import type { PersistedSchedulerTaskState } from './persisted-scheduler-state';

type StoredTaskState = SchedulerTaskStateDocument & { _deleted?: boolean };

function taskState(
	overrides: Partial<PersistedSchedulerTaskState> = {}
): PersistedSchedulerTaskState {
	return {
		taskId: 'orders:orders:open:windowed',
		requirementId: 'orders.open',
		collection: 'orders',
		queryKey: 'orders:open',
		limit: 25,
		priority: 600,
		mode: 'windowed',
		status: 'in-flight',
		ownerId: 'tab-a',
		claimedUntilMs: 2_000,
		attempt: 1,
		retryAfterMs: null,
		updatedAtMs: 1_000,
		...overrides,
	};
}

function storedTaskState(state: PersistedSchedulerTaskState): StoredTaskState {
	const { collection, ...rest } = state;
	return {
		...rest,
		stateKey: schedulerTaskStateKey(state.taskId),
		collectionName: collection,
		schemaVersion: 4,
	};
}

function createCollection(documents: StoredTaskState[] = []) {
	const stored = new Map(documents.map((document) => [document.stateKey, { ...document }]));
	const insert = vi.fn(async (item: StoredTaskState) => {
		if (stored.has(item.stateKey)) {
			const error = new Error('document conflict') as Error & { code: string };
			error.code = 'CONFLICT';
			throw error;
		}
		stored.set(item.stateKey, { ...item });
	});
	const bulkUpsert = vi.fn(async (items: StoredTaskState[]) => {
		for (const item of items) stored.set(item.stateKey, { ...item });
	});
	const find = vi.fn((_query?: unknown) => ({
		exec: vi.fn(async () =>
			[...stored.values()]
				.filter((document) => !document._deleted)
				.map((document) => ({ toJSON: () => ({ ...document }) }))
		),
	}));
	const findOne = vi.fn((stateKey: string) => ({
		exec: vi.fn(async () => {
			const document = stored.get(stateKey);
			if (!document || document._deleted) return null;
			return {
				toJSON: () => ({ ...document }),
				incrementalModify: vi.fn(async (mutator: (current: StoredTaskState) => StoredTaskState) => {
					const next = mutator({ ...document });
					if (next._deleted) {
						stored.delete(stateKey);
					} else {
						stored.set(stateKey, { ...next });
					}
				}),
			};
		}),
	}));
	return {
		collection: { insert, bulkUpsert, find, findOne },
		stored,
		insert,
		bulkUpsert,
		find,
		findOne,
	};
}

function repositoryFor(documents: PersistedSchedulerTaskState[] = []) {
	const fixture = createCollection(documents.map(storedTaskState));
	const repository = new RxSchedulerTaskStateRepository({
		schedulerTaskStates: fixture.collection,
	} as never);
	return { repository, ...fixture };
}

describe('RxSchedulerTaskStateRepository', () => {
	it('stores task collection under a non-reserved RxDB field name', () => {
		expect(schedulerTaskStateSchema.properties).not.toHaveProperty('collection');
		expect(schedulerTaskStateSchema.properties).toHaveProperty('collectionName');
		expect(schedulerTaskStateSchema.required).toContain('collectionName');
		expect(schedulerTaskStateSchema.indexes).toContainEqual(['collectionName', 'queryKey']);
	});

	it('allows task ids large enough for targeted batches built from existing field limits', () => {
		const maxCollectionLength = schedulerTaskStateSchema.properties.collectionName.maxLength;
		const maxQueryKeyLength = schedulerTaskStateSchema.properties.queryKey.maxLength;
		const maxModeLength = schedulerTaskStateSchema.properties.mode.maxLength;
		const maxRecordIdLength = 128;
		const twoRecordTargetedTaskIdLength =
			maxCollectionLength +
			1 +
			maxQueryKeyLength +
			1 +
			maxModeLength +
			1 +
			maxRecordIdLength +
			1 +
			maxRecordIdLength;

		const longTaskId = 'x'.repeat(twoRecordTargetedTaskIdLength * 2);
		const stateKey = schedulerTaskStateKey(longTaskId);

		expect(schedulerTaskStateSchema.primaryKey).toBe('stateKey');
		expect(stateKey.length).toBeLessThanOrEqual(
			schedulerTaskStateSchema.properties.stateKey.maxLength
		);
		expect(schedulerTaskStateSchema.properties.taskId).not.toHaveProperty('maxLength');
	});

	it('upserts scheduler task state documents with schema markers', async () => {
		const { repository, bulkUpsert } = repositoryFor();
		const next = taskState({ taskId: 'orders:open', ownerId: 'tab-b' });

		await repository.upsert(next);

		expect(bulkUpsert).toHaveBeenCalledWith([storedTaskState(next)]);
	});

	it('claim-inserts a new scheduler task only when the task id is absent', async () => {
		const { repository, insert, stored } = repositoryFor();
		const next = taskState({ taskId: 'orders:open', ownerId: 'tab-b' });

		await expect(repository.claimNew(next)).resolves.toBe(true);

		expect(insert).toHaveBeenCalledWith(storedTaskState(next));
		expect(stored.get(schedulerTaskStateKey('orders:open'))).toEqual(storedTaskState(next));
	});

	it('does not overwrite an existing scheduler task when claim-insert loses the primary-key race', async () => {
		const existing = taskState({ taskId: 'orders:open', ownerId: 'tab-a', attempt: 1 });
		const newerClaim = taskState({ taskId: 'orders:open', ownerId: 'tab-b', attempt: 1 });
		const { repository, stored } = repositoryFor([existing]);

		await expect(repository.claimNew(newerClaim)).resolves.toBe(false);

		expect(stored.get(schedulerTaskStateKey('orders:open'))).toEqual(storedTaskState(existing));
	});

	it('reads requested task ids sorted by task id without exposing schema markers', async () => {
		const { repository, find } = repositoryFor([
			taskState({ taskId: 'orders:z' }),
			taskState({ taskId: 'orders:a' }),
			taskState({ taskId: 'orders:m' }),
		]);

		await expect(repository.readForTaskIds(['orders:z', 'orders:a'])).resolves.toEqual([
			taskState({ taskId: 'orders:a' }),
			taskState({ taskId: 'orders:z' }),
		]);
		expect(find).toHaveBeenCalledWith({
			selector: { stateKey: { $in: ['orders:z', 'orders:a'].map(schedulerTaskStateKey) } },
			sort: [{ stateKey: 'asc' }],
		});
	});

	it('round-trips the wooIds numeric channel through persisted storage (uuid-ready targeted fetch)', async () => {
		const { repository } = repositoryFor([
			taskState({
				taskId: 'orders:ids:deep-link:on-demand',
				ids: ['woo-order:123', 'woo-order:456'],
				wooIds: [123, 456],
			}),
		]);

		const [readBack] = await repository.readForTaskIds(['orders:ids:deep-link:on-demand']);
		expect(readBack.wooIds).toEqual([123, 456]);
	});

	it('stores compact primary keys while preserving long domain task ids', async () => {
		const longTaskId = `orders:orders:ids:on-demand:${Array.from({ length: 12 }, (_, index) => `${index}`.padStart(128, 'x')).join(',')}`;
		const longTask = taskState({ taskId: longTaskId, ids: ['order-1'] });
		const { repository, stored } = repositoryFor();

		await repository.upsert(longTask);

		const compactKey = schedulerTaskStateKey(longTaskId);
		expect(stored.has(longTaskId)).toBe(false);
		expect(stored.get(compactKey)).toEqual(storedTaskState(longTask));
		await expect(repository.readForTaskIds([longTaskId])).resolves.toEqual([longTask]);
	});

	it('returns runnable queued, expired-owner, and retry-ready task states sorted by priority then task id', async () => {
		const { repository, find } = repositoryFor([
			taskState({
				taskId: 'active-owner',
				priority: 900,
				status: 'in-flight',
				claimedUntilMs: 2_000,
				retryAfterMs: null,
			}),
			taskState({
				taskId: 'expired-low',
				priority: 100,
				status: 'in-flight',
				claimedUntilMs: 1_000,
				retryAfterMs: null,
			}),
			taskState({
				taskId: 'expired-high',
				priority: 900,
				status: 'in-flight',
				claimedUntilMs: 1_000,
				retryAfterMs: null,
			}),
			taskState({
				taskId: 'backoff-active',
				priority: 800,
				status: 'failed',
				ownerId: null,
				claimedUntilMs: null,
				retryAfterMs: 2_000,
			}),
			taskState({
				taskId: 'retry-ready',
				priority: 700,
				status: 'failed',
				ownerId: null,
				claimedUntilMs: null,
				retryAfterMs: 1_000,
			}),
			taskState({
				taskId: 'queued',
				priority: 700,
				status: 'queued',
				ownerId: null,
				claimedUntilMs: null,
				retryAfterMs: null,
			}),
			taskState({
				taskId: 'completed',
				priority: 1_000,
				status: 'completed',
				ownerId: null,
				claimedUntilMs: null,
				retryAfterMs: null,
			}),
		]);

		await expect(repository.readRunnable(1_500)).resolves.toEqual([
			expect.objectContaining({ taskId: 'expired-high' }),
			expect.objectContaining({ taskId: 'queued' }),
			expect.objectContaining({ taskId: 'retry-ready' }),
			expect.objectContaining({ taskId: 'expired-low' }),
		]);
		expect(find).toHaveBeenCalledWith({
			selector: { status: { $in: ['queued', 'in-flight', 'failed'] } },
			sort: [{ priority: 'desc' }],
		});
	});

	it('claims a runnable scheduler task only when stored state still matches expected state', async () => {
		const expired = taskState({
			taskId: 'orders:a',
			ownerId: 'tab-a',
			attempt: 1,
			claimedUntilMs: 1_000,
			updatedAtMs: 1_000,
		});
		const claimed = taskState({
			...expired,
			ownerId: 'tab-b',
			attempt: 2,
			claimedUntilMs: 2_000,
			updatedAtMs: 1_500,
		});
		const { repository, stored } = repositoryFor([expired]);

		await expect(repository.claim(expired, claimed)).resolves.toBe(true);

		expect(stored.get(schedulerTaskStateKey('orders:a'))).toEqual(storedTaskState(claimed));
	});

	it('does not claim over a newer scheduler task owner attempt', async () => {
		const older = taskState({
			taskId: 'orders:a',
			ownerId: 'tab-a',
			attempt: 1,
			claimedUntilMs: 1_000,
			updatedAtMs: 1_000,
		});
		const newer = taskState({
			taskId: 'orders:a',
			ownerId: 'tab-c',
			attempt: 3,
			claimedUntilMs: 3_000,
			updatedAtMs: 2_000,
		});
		const claimedFromOlder = taskState({
			...older,
			ownerId: 'tab-b',
			attempt: 2,
			claimedUntilMs: 2_000,
			updatedAtMs: 1_500,
		});
		const { repository, stored } = repositoryFor([newer]);

		await expect(repository.claim(older, claimedFromOlder)).resolves.toBe(false);

		expect(stored.get(schedulerTaskStateKey('orders:a'))).toEqual(storedTaskState(newer));
	});

	it('does not replace a scheduler task with a different task id', async () => {
		const expected = taskState({ taskId: 'orders:a', ownerId: 'tab-a', attempt: 1 });
		const crossTaskClaim = taskState({
			...expected,
			taskId: 'orders:b',
			ownerId: 'tab-b',
			attempt: 2,
		});
		const { repository, stored } = repositoryFor([expected]);

		await expect(repository.claim(expected, crossTaskClaim)).resolves.toBe(false);

		expect(stored.get(schedulerTaskStateKey('orders:a'))).toEqual(storedTaskState(expected));
		expect(stored.has(schedulerTaskStateKey('orders:b'))).toBe(false);
	});

	it('marks a scheduler task failed only when the stored state still matches expected state', async () => {
		const inFlight = taskState({
			taskId: 'orders:a',
			ownerId: 'tab-a',
			attempt: 1,
			claimedUntilMs: 1_000,
			updatedAtMs: 1_000,
		});
		const failed = taskState({
			...inFlight,
			status: 'failed',
			ownerId: null,
			claimedUntilMs: null,
			retryAfterMs: 2_000,
			updatedAtMs: 1_500,
		});
		const { repository, stored } = repositoryFor([inFlight]);

		await expect(repository.markFailed(inFlight, failed)).resolves.toBe(true);

		expect(stored.get(schedulerTaskStateKey('orders:a'))).toEqual(storedTaskState(failed));
	});

	it('marks a scheduler task completed only when the stored state still matches expected state', async () => {
		const inFlight = taskState({
			taskId: 'orders:a',
			ownerId: 'tab-a',
			attempt: 1,
			claimedUntilMs: 1_000,
			updatedAtMs: 1_000,
		});
		const completed = taskState({
			...inFlight,
			status: 'completed',
			ownerId: null,
			claimedUntilMs: null,
			retryAfterMs: null,
			updatedAtMs: 1_500,
		});
		const { repository, stored } = repositoryFor([inFlight]);

		await expect(repository.markCompleted(inFlight, completed)).resolves.toBe(true);

		expect(stored.get(schedulerTaskStateKey('orders:a'))).toEqual(storedTaskState(completed));
	});

	it('removes a scheduler task only when stored state still matches expected state', async () => {
		const current = taskState({ taskId: 'orders:a' });
		const { repository, stored } = repositoryFor([current]);

		await expect(repository.remove(current)).resolves.toBe(true);

		expect(stored.has(schedulerTaskStateKey('orders:a'))).toBe(false);
	});

	it('does not remove or mark failed state when targeted ids differ', async () => {
		const storedState = taskState({ taskId: 'orders:targeted', ids: ['order-1'] });
		const expectedState = taskState({ taskId: 'orders:targeted', ids: ['order-2'] });
		const failedState = taskState({
			...expectedState,
			status: 'failed',
			ownerId: null,
			claimedUntilMs: null,
			retryAfterMs: 2_000,
		});
		const { repository, stored } = repositoryFor([storedState]);

		await expect(repository.remove(expectedState)).resolves.toBe(false);
		await expect(repository.markFailed(expectedState, failedState)).resolves.toBe(false);

		expect(stored.get(schedulerTaskStateKey('orders:targeted'))).toEqual(
			storedTaskState(storedState)
		);
	});

	it('does not remove or mark failed state when only the wooIds numeric channel differs', async () => {
		// Once document keys are uuids, ids can match while wooIds (the real fetch target)
		// differs — the CAS guard must treat that as a changed row, not a stale match.
		const storedState = taskState({ taskId: 'orders:targeted', ids: ['woo-order:1'], wooIds: [1] });
		const expectedState = taskState({
			taskId: 'orders:targeted',
			ids: ['woo-order:1'],
			wooIds: [2],
		});
		const failedState = taskState({
			...expectedState,
			status: 'failed',
			ownerId: null,
			claimedUntilMs: null,
			retryAfterMs: 2_000,
		});
		const { repository, stored } = repositoryFor([storedState]);

		await expect(repository.remove(expectedState)).resolves.toBe(false);
		await expect(repository.markFailed(expectedState, failedState)).resolves.toBe(false);

		expect(stored.get(schedulerTaskStateKey('orders:targeted'))).toEqual(
			storedTaskState(storedState)
		);
	});
});

describe('RxSchedulerTaskStateRepository — change-signal coalescing (#318)', () => {
	const nowMs = 5_000;

	describe('requestRerunOrReseed', () => {
		it('flags an actively in-flight task to re-run, touching NO field the completion CAS compares', async () => {
			const inFlight = taskState({
				status: 'in-flight',
				claimedUntilMs: 6_000,
				updatedAtMs: 1_000,
				attempt: 2,
			});
			const { repository, stored } = repositoryFor([inFlight]);

			const outcome = await repository.requestRerunOrReseed(
				inFlight,
				taskState({ status: 'queued', attempt: 2 }),
				nowMs
			);

			expect(outcome).toBe('rerun-requested');
			const doc = stored.get(schedulerTaskStateKey(inFlight.taskId));
			expect(doc?.rerunRequested).toBe(true);
			// The CAS-compared fields must be untouched so the owner's completion still matches.
			expect(doc?.status).toBe('in-flight');
			expect(doc?.updatedAtMs).toBe(1_000);
			expect(doc?.attempt).toBe(2);
			expect(doc?.claimedUntilMs).toBe(6_000);
		});

		it('strips present-but-undefined ids/wooIds from a legacy in-flight lane row when flagging a rerun', async () => {
			// A legacy/corrupt in-flight lane row whose optional keys are PRESENT with value
			// undefined (as written before toDocument stripped them). A change arriving while the
			// lease is still valid takes the in-flight branch, which rewrites the doc — it must run
			// through the same omit-undefined logic as toDocument or z-schema rejects the rewrite
			// with VD2 ("Expected type array but found type undefined").
			const corruptInFlight: StoredTaskState = {
				stateKey: schedulerTaskStateKey('orders:orders:open:windowed'),
				taskId: 'orders:orders:open:windowed',
				requirementId: 'orders.open',
				collectionName: 'orders',
				queryKey: 'orders:open',
				ids: undefined,
				wooIds: undefined,
				limit: 25,
				priority: 600,
				mode: 'windowed',
				status: 'in-flight',
				ownerId: 'tab-a',
				claimedUntilMs: 6_000,
				attempt: 1,
				retryAfterMs: null,
				updatedAtMs: 1_000,
				schemaVersion: 4,
			};
			const fixture = createCollection([corruptInFlight]);
			const repository = new RxSchedulerTaskStateRepository({
				schedulerTaskStates: fixture.collection,
			} as never);

			const outcome = await repository.requestRerunOrReseed(
				taskState({ status: 'in-flight', claimedUntilMs: 6_000, updatedAtMs: 1_000, attempt: 1 }),
				taskState({ status: 'queued' }),
				nowMs
			);

			expect(outcome).toBe('rerun-requested');
			const doc = fixture.stored.get(corruptInFlight.stateKey)!;
			expect(doc.rerunRequested).toBe(true);
			// The present-but-undefined optional keys must be ABSENT after the rewrite, not
			// re-written as `ids: undefined` (which z-schema rejects, VD2).
			expect(Object.keys(doc)).not.toContain('ids');
			expect(Object.keys(doc)).not.toContain('wooIds');
			// CAS-compared fields stay untouched so the owner's completion still matches.
			expect(doc.status).toBe('in-flight');
			expect(doc.claimedUntilMs).toBe(6_000);
			expect(doc.updatedAtMs).toBe(1_000);
		});

		it('leaves a lease-expired task untouched (it will be re-claimed and run on its own)', async () => {
			const expired = taskState({ status: 'in-flight', claimedUntilMs: 4_000 }); // <= nowMs
			const { repository, stored } = repositoryFor([expired]);

			expect(
				await repository.requestRerunOrReseed(expired, taskState({ status: 'queued' }), nowMs)
			).toBe('skipped');
			// Untouched — the runnable (lease-expired) task re-claims + re-fetches the change itself.
			expect(stored.get(schedulerTaskStateKey(expired.taskId))).toEqual(storedTaskState(expired));
		});

		it('leaves a FAILED task untouched — preserving its retry backoff (codex P2)', async () => {
			const failed = taskState({
				status: 'failed',
				ownerId: null,
				claimedUntilMs: null,
				retryAfterMs: 9_000,
				attempt: 3,
			});
			const { repository, stored } = repositoryFor([failed]);

			// Race: the owner failed the task between our read (in-flight) and this write. We must
			// NOT re-queue it (that would clear retryAfterMs) — the retry will re-fetch the change.
			expect(
				await repository.requestRerunOrReseed(failed, taskState({ status: 'queued' }), nowMs)
			).toBe('skipped');
			expect(stored.get(schedulerTaskStateKey(failed.taskId))).toEqual(storedTaskState(failed));
		});

		it('re-queues directly when the task already completed (race: owner finished before our write, no future run)', async () => {
			const completed = taskState({ status: 'completed', ownerId: null, claimedUntilMs: null });
			const reseeded = taskState({
				status: 'queued',
				attempt: 0,
				ownerId: null,
				claimedUntilMs: null,
				updatedAtMs: nowMs,
			});
			const { repository, stored } = repositoryFor([completed]);

			expect(await repository.requestRerunOrReseed(completed, reseeded, nowMs)).toBe('requeued');
			expect(stored.get(schedulerTaskStateKey(completed.taskId))?.status).toBe('queued');
		});

		it('returns skipped when the task row is gone', async () => {
			const { repository } = repositoryFor([]);
			expect(await repository.requestRerunOrReseed(taskState(), taskState(), nowMs)).toBe(
				'skipped'
			);
		});
	});

	describe('completeOrRequeue', () => {
		it('completes normally when no re-run was requested', async () => {
			const inFlight = taskState({ status: 'in-flight' });
			const completed = taskState({
				status: 'completed',
				ownerId: null,
				claimedUntilMs: null,
				updatedAtMs: nowMs,
			});
			const { repository, stored } = repositoryFor([inFlight]);

			expect(
				await repository.completeOrRequeue(inFlight, completed, taskState({ status: 'queued' }))
			).toBe('completed');
			expect(stored.get(schedulerTaskStateKey(inFlight.taskId))?.status).toBe('completed');
		});

		it("re-queues (clearing the flag) when a re-run was requested mid-flight, even though the runner's expected state predates the flag", async () => {
			const flagged = { ...taskState({ status: 'in-flight' }), rerunRequested: true };
			const completed = taskState({ status: 'completed', ownerId: null, claimedUntilMs: null });
			const requeued = taskState({
				status: 'queued',
				attempt: 0,
				ownerId: null,
				claimedUntilMs: null,
				updatedAtMs: nowMs,
			});
			const { repository, stored } = repositoryFor([flagged]);

			// The runner's expected state is the ORIGINAL claim (no flag) — it still matches
			// because rerunRequested is excluded from the CAS.
			const outcome = await repository.completeOrRequeue(
				taskState({ status: 'in-flight' }),
				completed,
				requeued
			);

			expect(outcome).toBe('requeued');
			const doc = stored.get(schedulerTaskStateKey(flagged.taskId));
			expect(doc?.status).toBe('queued');
			expect(doc?.rerunRequested).toBe(false); // cleared so it cannot loop forever
			expect(doc?.attempt).toBe(0);
		});

		it('loses the claim (no write) when the current state no longer matches the expected owner', async () => {
			const stolen = taskState({ status: 'in-flight', ownerId: 'tab-b', updatedAtMs: 9_999 });
			const { repository, stored } = repositoryFor([stolen]);

			const outcome = await repository.completeOrRequeue(
				taskState({ status: 'in-flight', ownerId: 'tab-a' }),
				taskState({ status: 'completed' }),
				taskState({ status: 'queued' })
			);

			expect(outcome).toBe('claim-lost');
			expect(stored.get(schedulerTaskStateKey(stolen.taskId))).toEqual(storedTaskState(stolen));
		});
	});

	it('END-TO-END: a change seeded mid-flight survives the completion CAS and forces a fresh re-run instead of a silent drop', async () => {
		// The exact #318 race: a task is claimed + in-flight, a fresh change arrives and the
		// seeder flags it, then the owning runner completes with its STALE (pre-flag) expected
		// state. The change must NOT be dropped — the completion must re-queue.
		const claimed = taskState({ status: 'in-flight', claimedUntilMs: 6_000, updatedAtMs: 1_000 });
		const { repository, stored } = repositoryFor([claimed]);

		expect(
			await repository.requestRerunOrReseed(claimed, taskState({ status: 'queued' }), nowMs)
		).toBe('rerun-requested');

		const requeued = taskState({
			status: 'queued',
			attempt: 0,
			ownerId: null,
			claimedUntilMs: null,
			updatedAtMs: nowMs,
		});
		const outcome = await repository.completeOrRequeue(
			claimed,
			taskState({ status: 'completed', ownerId: null, claimedUntilMs: null }),
			requeued
		);

		expect(outcome).toBe('requeued');
		const doc = stored.get(schedulerTaskStateKey(claimed.taskId));
		expect(doc?.status).toBe('queued');
		expect(doc?.rerunRequested).toBe(false);
	});

	it('preserves the rerun flag across a lease renewal (claim) — a multi-page greedy task is not silently completed', async () => {
		// The P1 codex caught: a greedy task that needs another page RENEWS its lease via
		// claim(activeState, renewedState). Because the CAS ignores rerunRequested, the
		// renewal would overwrite the flag the seeder set — unless claim carries it forward.
		const claimed = taskState({ status: 'in-flight', claimedUntilMs: 6_000, updatedAtMs: 1_000 });
		const { repository, stored } = repositoryFor([claimed]);

		// Seeder flags the still-in-flight task (page 1 already fetched).
		expect(
			await repository.requestRerunOrReseed(claimed, taskState({ status: 'queued' }), nowMs)
		).toBe('rerun-requested');

		// Runner renews its lease for page 2 with a fresh renewed state that carries NO flag.
		const renewed = taskState({ status: 'in-flight', claimedUntilMs: 9_000, updatedAtMs: 1_000 });
		expect(await repository.claim(claimed, renewed)).toBe(true);
		const afterRenewal = stored.get(schedulerTaskStateKey(claimed.taskId));
		expect(afterRenewal?.rerunRequested).toBe(true); // survived the renewal
		expect(afterRenewal?.claimedUntilMs).toBe(9_000); // renewal still applied

		// Completion after the renewal must STILL re-queue — the mid-flight change is not dropped.
		const outcome = await repository.completeOrRequeue(
			renewed,
			taskState({ status: 'completed', ownerId: null, claimedUntilMs: null }),
			taskState({
				status: 'queued',
				attempt: 0,
				ownerId: null,
				claimedUntilMs: null,
				updatedAtMs: nowMs,
			})
		);
		expect(outcome).toBe('requeued');
		expect(stored.get(schedulerTaskStateKey(claimed.taskId))?.status).toBe('queued');
	});

	it('preserves the rerun flag across a mark-failed → retry so the coalesced change survives a failed page', async () => {
		const claimed = taskState({
			status: 'in-flight',
			claimedUntilMs: 6_000,
			updatedAtMs: 1_000,
			attempt: 1,
		});
		const { repository, stored } = repositoryFor([claimed]);
		await repository.requestRerunOrReseed(claimed, taskState({ status: 'queued' }), nowMs);

		// The fetch fails → markFailed replaces the whole doc; the flag must persist to the retry.
		const failed = taskState({
			status: 'failed',
			ownerId: null,
			claimedUntilMs: null,
			retryAfterMs: 9_000,
			attempt: 2,
			updatedAtMs: 1_000,
		});
		expect(await repository.markFailed(claimed, failed)).toBe(true);
		expect(stored.get(schedulerTaskStateKey(claimed.taskId))?.rerunRequested).toBe(true);
	});
});
