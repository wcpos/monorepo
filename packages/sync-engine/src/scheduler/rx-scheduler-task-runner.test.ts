// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
	type PersistedSchedulerTaskRunnerRepository,
	runPersistedSchedulerTasks,
} from './rx-scheduler-task-runner';

import type { PersistedSchedulerTaskState } from './persisted-scheduler-state';

function state(overrides: Partial<PersistedSchedulerTaskState> = {}): PersistedSchedulerTaskState {
	return {
		taskId: 'orders:orders:open:windowed',
		requirementId: 'orders.open',
		collection: 'orders',
		queryKey: 'orders:open',
		limit: 25,
		priority: 600,
		mode: 'windowed',
		status: 'failed',
		ownerId: null,
		claimedUntilMs: null,
		attempt: 1,
		retryAfterMs: 900,
		updatedAtMs: 800,
		...overrides,
	};
}

function createRepository(
	runnable: PersistedSchedulerTaskState[],
	claimResult: boolean | boolean[] = true,
	completeResult = true,
	failResult = true
): PersistedSchedulerTaskRunnerRepository {
	const claimResults = Array.isArray(claimResult) ? [...claimResult] : null;
	const steadyClaimResult = typeof claimResult === 'boolean' ? claimResult : true;
	return {
		readRunnable: vi.fn(async () => runnable),
		claim: vi.fn(async () => claimResults?.shift() ?? steadyClaimResult),
		// Preserve the old boolean contract: true → a normal completion, false → claim-lost.
		completeOrRequeue: vi.fn(async () => (completeResult ? 'completed' : 'claim-lost')),
		markFailed: vi.fn(async () => failResult),
	};
}

function createThrowingCompletionRepository(
	runnable: PersistedSchedulerTaskState[]
): PersistedSchedulerTaskRunnerRepository {
	return {
		...createRepository(runnable),
		completeOrRequeue: vi.fn(async () => {
			throw new Error('completion write failed');
		}),
	};
}

const baseInput = {
	ownerId: 'tab-runner',
	nowMs: 1_000,
	leaseForMs: 300,
	retryAfterMs: 500,
};

describe('per-task drain outcomes', () => {
	// A drain tick runs EVERY runnable task, so its aggregate counters describe the tick, not
	// any one declarer's work. Callers that wait on a single task (the require-plane browse and
	// refresh branches) need their OWN task's result, or one unrelated failure makes a
	// successful browse reject.
	it('reports each task separately when one succeeds and another fails', async () => {
		const good = state({
			taskId: 'products:browse:windowed',
			collection: 'products',
			queryKey: 'products:browse',
		});
		const bad = state({
			taskId: 'orders:browser:windowed',
			collection: 'orders',
			queryKey: 'orders:browser',
		});
		const repository = createRepository([good, bad]);
		const fetcher = vi.fn(async (task: { id: string }) => {
			if (task.id === bad.taskId) throw new Error('Woo REST orders request failed: 500');
			return { taskId: task.id, documentCount: 25, requestCount: 2, completed: true };
		});

		const result = await runPersistedSchedulerTasks({ ...baseInput, repository, fetcher });

		// The aggregate still describes the whole tick …
		expect(result).toMatchObject({ succeeded: 1, failed: 1, totalDocuments: 25, totalRequests: 2 });
		// … and each task now carries its own verdict and its own counts.
		expect(result.tasks).toEqual([
			{
				taskId: 'orders:browser:windowed',
				requirementId: 'orders.open',
				collection: 'orders',
				queryKey: 'orders:browser',
				kind: 'failed',
				documents: 0,
				requests: 0,
			},
			{
				taskId: 'products:browse:windowed',
				requirementId: 'orders.open',
				collection: 'products',
				queryKey: 'products:browse',
				kind: 'succeeded',
				documents: 25,
				requests: 2,
			},
		]);
	});

	it('attributes documents and requests to the task that fetched them', async () => {
		const first = state({ taskId: 'a:windowed', queryKey: 'a' });
		const second = state({ taskId: 'b:windowed', queryKey: 'b' });
		const repository = createRepository([first, second]);
		const fetcher = vi.fn(async (task: { id: string }) => ({
			taskId: task.id,
			documentCount: task.id === 'a:windowed' ? 10 : 3,
			requestCount: task.id === 'a:windowed' ? 1 : 4,
			completed: true,
		}));

		const result = await runPersistedSchedulerTasks({ ...baseInput, repository, fetcher });

		expect(
			result.tasks.map((outcome) => [outcome.taskId, outcome.documents, outcome.requests])
		).toEqual([
			['a:windowed', 10, 1],
			['b:windowed', 3, 4],
		]);
		expect(result).toMatchObject({ totalDocuments: 13, totalRequests: 5 });
	});

	it("records a lost claim as that task's own outcome, not a silent omission", async () => {
		const runnable = state({ taskId: 'lost:windowed', queryKey: 'lost' });
		const repository = createRepository([runnable], false);
		const fetcher = vi.fn(async () => ({
			taskId: runnable.taskId,
			documentCount: 0,
			requestCount: 0,
			completed: true,
		}));

		const result = await runPersistedSchedulerTasks({ ...baseInput, repository, fetcher });

		expect(result.claimLost).toBe(1);
		expect(result.tasks).toEqual([
			expect.objectContaining({
				taskId: 'lost:windowed',
				kind: 'claim-lost',
				documents: 0,
				requests: 0,
			}),
		]);
	});

	it("records a lost completion as that task's own outcome", async () => {
		const runnable = state({ taskId: 'completion:windowed', queryKey: 'completion' });
		const repository = createRepository([runnable], true, false);
		const fetcher = vi.fn(async () => ({
			taskId: runnable.taskId,
			documentCount: 7,
			requestCount: 1,
			completed: true,
		}));

		const result = await runPersistedSchedulerTasks({ ...baseInput, repository, fetcher });

		expect(result.completionLost).toBe(1);
		expect(result.tasks).toEqual([
			expect.objectContaining({
				taskId: 'completion:windowed',
				kind: 'completion-lost',
				documents: 7,
				requests: 1,
			}),
		]);
	});

	it('records a failed markFailed write as failure-lost for that task', async () => {
		const runnable = state({ taskId: 'failure:windowed', queryKey: 'failure' });
		const repository = createRepository([runnable], true, true, false);
		const fetcher = vi.fn(async () => {
			throw new Error('boom');
		});

		const result = await runPersistedSchedulerTasks({ ...baseInput, repository, fetcher });

		expect(result.failureLost).toBe(1);
		expect(result.tasks).toEqual([
			expect.objectContaining({ taskId: 'failure:windowed', kind: 'failure-lost' }),
		]);
	});
});

describe('runPersistedSchedulerTasks', () => {
	it('claims runnable scheduler state, fetches it, and marks the claimed state completed', async () => {
		const runnable = state();
		const repository = createRepository([runnable]);
		const fetcher = vi.fn(async () => ({
			taskId: runnable.taskId,
			documentCount: 25,
			requestCount: 1,
			completed: true,
		}));

		const result = await runPersistedSchedulerTasks({
			...baseInput,
			repository,
			fetcher,
		});

		const claimedState = state({
			status: 'in-flight',
			ownerId: 'tab-runner',
			claimedUntilMs: 1_300,
			attempt: 2,
			retryAfterMs: null,
			updatedAtMs: 1_000,
		});
		const completedState = state({
			...claimedState,
			status: 'completed',
			ownerId: null,
			claimedUntilMs: null,
			updatedAtMs: 1_000,
		});
		expect(repository.claim).toHaveBeenCalledWith(runnable, claimedState);
		expect(fetcher).toHaveBeenCalledWith({
			id: runnable.taskId,
			requirementId: runnable.requirementId,
			collection: runnable.collection,
			queryKey: runnable.queryKey,
			ids: runnable.ids,
			limit: runnable.limit,
			priority: runnable.priority,
			mode: runnable.mode,
		});
		expect(repository.completeOrRequeue).toHaveBeenCalledWith(
			claimedState,
			completedState,
			expect.objectContaining({ status: 'queued', attempt: 0 })
		);
		expect(result).toEqual({
			scanned: 1,
			claimLost: 0,
			completionLost: 0,
			failureLost: 0,
			renewalLost: 0,
			succeeded: 1,
			coalescedReruns: 0,
			failed: 0,
			totalDocuments: 25,
			totalRequests: 1,
			// A real drain is never a ledger-rebuild abort (#956).
			ledgerRebuilt: false,
			// The tick's aggregate is mirrored by this task's own verdict.
			tasks: [
				{
					taskId: 'orders:orders:open:windowed',
					requirementId: 'orders.open',
					collection: 'orders',
					queryKey: 'orders:open',
					kind: 'succeeded',
					documents: 25,
					requests: 1,
				},
			],
		});
	});

	it('does not fail a completed fetch when the progress observer throws', async () => {
		const runnable = state();
		const repository = createRepository([runnable]);
		const fetcher = vi.fn(async () => ({
			taskId: runnable.taskId,
			documentCount: 25,
			requestCount: 1,
			completed: true,
		}));
		const onProgress = vi.fn(() => {
			throw new Error('observer failed');
		});

		const result = await runPersistedSchedulerTasks({
			...baseInput,
			repository,
			fetcher,
			onProgress,
		});

		expect(onProgress).toHaveBeenCalledWith({
			collection: runnable.collection,
			documents: 25,
			requests: 1,
		});
		expect(result.succeeded).toBe(1);
		expect(repository.completeOrRequeue).toHaveBeenCalledTimes(1);
		expect(repository.markFailed).not.toHaveBeenCalled();
	});

	it('does not fetch when the guarded claim loses to a newer owner', async () => {
		const repository = createRepository([state()], false);
		const fetcher = vi.fn(async () => ({
			taskId: 'orders:orders:open:windowed',
			documentCount: 25,
			requestCount: 1,
			completed: true,
		}));

		const result = await runPersistedSchedulerTasks({
			...baseInput,
			repository,
			fetcher,
		});

		expect(result.claimLost).toBe(1);
		expect(fetcher).not.toHaveBeenCalled();
		expect(repository.completeOrRequeue).not.toHaveBeenCalled();
		expect(repository.markFailed).not.toHaveBeenCalled();
	});

	it('counts a coalesced re-run as a success when the completion re-queued instead of finishing (#318)', async () => {
		const runnable = state();
		const repository = createRepository([runnable]);
		// A change arrived mid-flight, so completeOrRequeue re-queued a fresh run.
		vi.mocked(repository.completeOrRequeue).mockResolvedValueOnce('requeued');
		const fetcher = vi.fn(async () => ({
			taskId: runnable.taskId,
			documentCount: 25,
			requestCount: 1,
			completed: true,
		}));

		const result = await runPersistedSchedulerTasks({ ...baseInput, repository, fetcher });

		expect(result.succeeded).toBe(1);
		expect(result.coalescedReruns).toBe(1);
		expect(result.completionLost).toBe(0);
	});

	it('does not report success when the guarded completion update loses to a newer owner', async () => {
		const runnable = state();
		const repository = createRepository([runnable], true, false);
		const fetcher = vi.fn(async () => ({
			taskId: runnable.taskId,
			documentCount: 25,
			requestCount: 1,
			completed: true,
		}));

		const result = await runPersistedSchedulerTasks({
			...baseInput,
			repository,
			fetcher,
		});

		expect(repository.completeOrRequeue).toHaveBeenCalled();
		expect(result.succeeded).toBe(0);
		expect(result.completionLost).toBe(1);
		expect(result.totalDocuments).toBe(25);
		expect(result.totalRequests).toBe(1);
	});

	it('surfaces completion persistence errors without marking successful fetches failed', async () => {
		const runnable = state();
		const repository = createThrowingCompletionRepository([runnable]);
		const fetcher = vi.fn(async () => ({
			taskId: runnable.taskId,
			documentCount: 25,
			requestCount: 1,
			completed: true,
		}));

		await expect(
			runPersistedSchedulerTasks({
				...baseInput,
				repository,
				fetcher,
			})
		).rejects.toThrow('completion write failed');

		expect(repository.markFailed).not.toHaveBeenCalled();
	});

	it('uses fresh time for each scheduler task claim', async () => {
		const first = state({ taskId: 'orders:first' });
		const second = state({ taskId: 'orders:second', requirementId: 'orders.second' });
		const repository = createRepository([first, second]);
		const getNowMs = vi
			.fn()
			.mockReturnValueOnce(900)
			.mockReturnValueOnce(1_000)
			.mockReturnValueOnce(1_100)
			.mockReturnValueOnce(5_000)
			.mockReturnValueOnce(5_100);
		const fetcher = vi.fn(async (task) => ({
			taskId: task.id,
			documentCount: 1,
			requestCount: 1,
			completed: true,
		}));

		await runPersistedSchedulerTasks({
			...baseInput,
			repository,
			getNowMs,
			fetcher,
		});

		expect(repository.readRunnable).toHaveBeenCalledWith(900);
		expect(repository.claim).toHaveBeenNthCalledWith(
			1,
			first,
			expect.objectContaining({
				taskId: 'orders:first',
				claimedUntilMs: 1_300,
				updatedAtMs: 1_000,
			})
		);
		expect(repository.claim).toHaveBeenNthCalledWith(
			2,
			second,
			expect.objectContaining({
				taskId: 'orders:second',
				claimedUntilMs: 5_300,
				updatedAtMs: 5_000,
			})
		);
	});

	it('drains runnable tasks in PRIORITY order (highest first), regardless of repository order', async () => {
		// The POS cannot sell without tax rates; a low-priority order backlog lane
		// must never drain ahead of the greedy tax-rate lane (C3 / pain point #2).
		const backlog = state({
			taskId: 'products:backfill',
			requirementId: 'products.backfill',
			collection: 'products',
			queryKey: 'products:backfill',
			priority: 100,
		});
		const taxes = state({
			taskId: 'taxRates:all:greedy',
			requirementId: 'taxRates.all',
			collection: 'taxRates',
			queryKey: 'taxRates:all',
			priority: 1000,
			mode: 'greedy',
		});
		const productsInitial = state({
			taskId: 'products:initial',
			requirementId: 'products.initial',
			collection: 'products',
			queryKey: 'products:initial',
			priority: 700,
		});
		// Repository returns them in NON-priority order.
		const repository = createRepository([backlog, taxes, productsInitial]);
		const fetcher = vi.fn(async (task) => ({
			taskId: task.id,
			documentCount: 1,
			requestCount: 1,
			completed: true,
		}));

		await runPersistedSchedulerTasks({ ...baseInput, repository, fetcher });

		const claimedOrder = (repository.claim as ReturnType<typeof vi.fn>).mock.calls.map(
			(call) => (call[0] as PersistedSchedulerTaskState).taskId
		);
		expect(claimedOrder).toEqual(['taxRates:all:greedy', 'products:initial', 'products:backfill']);
	});

	it('renews unexpired scheduler state already owned by this runner before fetching it', async () => {
		const runnable = state({
			status: 'in-flight',
			ownerId: 'tab-runner',
			claimedUntilMs: 1_250,
			attempt: 1,
			retryAfterMs: null,
			updatedAtMs: 1_000,
		});
		const repository = createRepository([]);
		const getNowMs = vi
			.fn()
			.mockReturnValueOnce(900)
			.mockReturnValueOnce(1_000)
			.mockReturnValueOnce(1_700);
		const fetcher = vi.fn(async () => ({
			taskId: runnable.taskId,
			documentCount: 25,
			requestCount: 1,
			completed: true,
		}));

		await runPersistedSchedulerTasks({
			...baseInput,
			repository,
			getNowMs,
			fetcher,
			claimedStates: [runnable],
		});

		expect(repository.readRunnable).toHaveBeenCalledWith(900);
		const renewedState = {
			...runnable,
			claimedUntilMs: 1_300,
			updatedAtMs: 1_000,
		};
		expect(repository.claim).toHaveBeenCalledWith(runnable, renewedState);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(repository.completeOrRequeue).toHaveBeenCalledWith(
			renewedState,
			{
				...renewedState,
				status: 'completed',
				ownerId: null,
				claimedUntilMs: null,
				retryAfterMs: null,
				updatedAtMs: 1_700,
			},
			expect.objectContaining({ status: 'queued', attempt: 0 })
		);
	});

	it('reclaims owned scheduler state when its lease expires before processing starts', async () => {
		const first = state({ taskId: 'orders:first', requirementId: 'orders.first' });
		const second = state({
			taskId: 'orders:second',
			requirementId: 'orders.second',
			status: 'in-flight',
			ownerId: 'tab-runner',
			claimedUntilMs: 1_050,
			attempt: 1,
			retryAfterMs: null,
			updatedAtMs: 900,
		});
		const repository = createRepository([first]);
		const getNowMs = vi
			.fn()
			.mockReturnValueOnce(900)
			.mockReturnValueOnce(1_000)
			.mockReturnValueOnce(1_100)
			.mockReturnValueOnce(2_000)
			.mockReturnValueOnce(2_100);
		const fetcher = vi.fn(async (task) => ({
			taskId: task.id,
			documentCount: 1,
			requestCount: 1,
			completed: true,
		}));

		await runPersistedSchedulerTasks({
			...baseInput,
			repository,
			getNowMs,
			fetcher,
			claimedStates: [second],
		});

		expect(repository.claim).toHaveBeenNthCalledWith(
			2,
			second,
			expect.objectContaining({
				taskId: 'orders:second',
				claimedUntilMs: 2_300,
				updatedAtMs: 2_000,
				attempt: 2,
			})
		);
	});

	it('stamps completed scheduler state at fetch completion time', async () => {
		const runnable = state();
		const repository = createRepository([runnable]);
		const getNowMs = vi
			.fn()
			.mockReturnValueOnce(900)
			.mockReturnValueOnce(1_000)
			.mockReturnValueOnce(1_700);
		const fetcher = vi.fn(async () => ({
			taskId: runnable.taskId,
			documentCount: 25,
			requestCount: 1,
			completed: true,
		}));

		await runPersistedSchedulerTasks({
			...baseInput,
			repository,
			getNowMs,
			fetcher,
		});

		const claimedState = state({
			status: 'in-flight',
			ownerId: 'tab-runner',
			claimedUntilMs: 1_300,
			attempt: 2,
			retryAfterMs: null,
			updatedAtMs: 1_000,
		});
		expect(repository.completeOrRequeue).toHaveBeenCalledWith(
			claimedState,
			{
				...claimedState,
				status: 'completed',
				ownerId: null,
				claimedUntilMs: null,
				updatedAtMs: 1_700,
			},
			expect.objectContaining({ status: 'queued', attempt: 0 })
		);
	});

	it('marks the claimed scheduler state failed with retry backoff when fetching fails', async () => {
		const runnable = state({
			status: 'in-flight',
			ownerId: 'tab-a',
			claimedUntilMs: 900,
			retryAfterMs: null,
		});
		const repository = createRepository([runnable]);
		const getNowMs = vi
			.fn()
			.mockReturnValueOnce(900)
			.mockReturnValueOnce(1_000)
			.mockReturnValueOnce(1_700);
		const fetcher = vi.fn(async () => {
			throw new Error('orders unavailable');
		});

		const result = await runPersistedSchedulerTasks({
			...baseInput,
			repository,
			getNowMs,
			fetcher,
		});

		const claimedState = state({
			status: 'in-flight',
			ownerId: 'tab-runner',
			claimedUntilMs: 1_300,
			attempt: 2,
			retryAfterMs: null,
			updatedAtMs: 1_000,
		});
		expect(repository.markFailed).toHaveBeenCalledWith(claimedState, {
			...claimedState,
			status: 'failed',
			ownerId: null,
			claimedUntilMs: null,
			retryAfterMs: 2_200,
			updatedAtMs: 1_700,
		});
		expect(repository.completeOrRequeue).not.toHaveBeenCalled();
		expect(result.failed).toBe(1);
	});

	it('marks a primary-collection reconciliation refusal failed with retry backoff', async () => {
		const runnable = state();
		const repository = createRepository([runnable]);
		const fetcher = vi.fn(async () => {
			throw new SyntaxError('index reconciliation refused: unsorted-primary');
		});

		const result = await runPersistedSchedulerTasks({
			...baseInput,
			repository,
			fetcher,
		});

		expect(repository.markFailed).toHaveBeenCalledOnce();
		expect(result.failed).toBe(1);
	});

	it('does not report failed state persistence when the guarded failure update loses to a newer owner', async () => {
		const runnable = state({
			status: 'in-flight',
			ownerId: 'tab-a',
			claimedUntilMs: 900,
			retryAfterMs: null,
		});
		const repository = createRepository([runnable], true, true, false);
		const getNowMs = vi
			.fn()
			.mockReturnValueOnce(900)
			.mockReturnValueOnce(1_000)
			.mockReturnValueOnce(1_700);
		const fetcher = vi.fn(async () => {
			throw new Error('orders unavailable');
		});

		const result = await runPersistedSchedulerTasks({
			...baseInput,
			repository,
			getNowMs,
			fetcher,
		});

		expect(repository.markFailed).toHaveBeenCalled();
		expect(result.failed).toBe(0);
		expect(result.failureLost).toBe(1);
	});

	it('drains a lower-priority lane even when a higher-priority lane throws (failure isolation)', async () => {
		// Regression (1.9.x bug 00baa0c76): a failed lookup left the whole collection
		// sync paused forever — one lane's failure starved every other lane. The
		// durable runner must isolate a throwing lane (markFailed → continue) so a
		// DIFFERENT, lower-priority lane in the same run still drains to completion.
		const failing = state({
			taskId: 'orders:open:windowed',
			requirementId: 'orders.unavailable',
			collection: 'orders',
			queryKey: 'orders:open',
			priority: 1000,
		});
		const draining = state({
			taskId: 'products:initial',
			requirementId: 'products.initial',
			collection: 'products',
			queryKey: 'products:initial',
			priority: 500,
		});
		// Repository order is irrelevant; the runner sorts highest-priority-first, so
		// the FAILING lane is processed BEFORE the one that must still drain.
		const repository = createRepository([draining, failing]);
		const fetcher = vi.fn(async (task) => {
			if (task.requirementId === 'orders.unavailable') {
				throw new Error('orders unavailable');
			}
			return { taskId: task.id, documentCount: 5, requestCount: 1, completed: true };
		});

		const result = await runPersistedSchedulerTasks({
			...baseInput,
			repository,
			fetcher,
		});

		// Both lanes were attempted; the throw did not abort the run.
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(result.failed).toBe(1);
		expect(result.succeeded).toBe(1);
		// The higher-priority lane failed…
		expect(repository.markFailed).toHaveBeenCalledTimes(1);
		expect(repository.markFailed).toHaveBeenCalledWith(
			expect.objectContaining({ taskId: 'orders:open:windowed' }),
			expect.objectContaining({ taskId: 'orders:open:windowed', status: 'failed' })
		);
		// …yet the lower-priority lane still drained to completion.
		expect(repository.completeOrRequeue).toHaveBeenCalledTimes(1);
		expect(repository.completeOrRequeue).toHaveBeenCalledWith(
			expect.objectContaining({ taskId: 'products:initial' }),
			expect.objectContaining({ taskId: 'products:initial', status: 'completed' }),
			expect.objectContaining({ taskId: 'products:initial', status: 'queued' })
		);
	});

	it('continues a claimed greedy scheduler state until the fetcher reports completion', async () => {
		const runnable = state({ mode: 'greedy' });
		const repository = createRepository([runnable]);
		const getNowMs = vi
			.fn()
			.mockReturnValueOnce(900)
			.mockReturnValueOnce(1_000)
			.mockReturnValueOnce(1_200)
			.mockReturnValueOnce(1_500);
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce({
				taskId: runnable.taskId,
				documentCount: 25,
				requestCount: 1,
				completed: false,
			})
			.mockResolvedValueOnce({
				taskId: runnable.taskId,
				documentCount: 10,
				requestCount: 1,
				completed: true,
			});

		const result = await runPersistedSchedulerTasks({
			...baseInput,
			repository,
			getNowMs,
			fetcher,
		});

		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(repository.claim).toHaveBeenCalledTimes(2);
		expect(repository.claim).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				taskId: runnable.taskId,
				claimedUntilMs: 1_300,
				updatedAtMs: 1_000,
			}),
			expect.objectContaining({
				taskId: runnable.taskId,
				claimedUntilMs: 1_500,
				updatedAtMs: 1_200,
				attempt: 2,
			})
		);
		expect(repository.completeOrRequeue).toHaveBeenCalledTimes(1);
		expect(result.succeeded).toBe(1);
		expect(result.totalDocuments).toBe(35);
		expect(result.totalRequests).toBe(2);
	});

	it('stops a greedy scheduler task when lease renewal loses to a newer owner', async () => {
		const runnable = state({ mode: 'greedy' });
		const repository = createRepository([runnable], [true, false]);
		const getNowMs = vi
			.fn()
			.mockReturnValueOnce(900)
			.mockReturnValueOnce(1_000)
			.mockReturnValueOnce(1_200);
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce({
				taskId: runnable.taskId,
				documentCount: 25,
				requestCount: 1,
				completed: false,
			})
			.mockResolvedValueOnce({
				taskId: runnable.taskId,
				documentCount: 10,
				requestCount: 1,
				completed: true,
			});

		const result = await runPersistedSchedulerTasks({
			...baseInput,
			repository,
			getNowMs,
			fetcher,
		});

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(repository.completeOrRequeue).not.toHaveBeenCalled();
		expect(repository.markFailed).not.toHaveBeenCalled();
		expect(result.renewalLost).toBe(1);
		expect(result.succeeded).toBe(0);
		expect(result.totalDocuments).toBe(25);
		expect(result.totalRequests).toBe(1);
	});

	it('marks greedy fetch failures against the latest renewed scheduler state', async () => {
		const runnable = state({ mode: 'greedy' });
		const repository = createRepository([runnable]);
		const getNowMs = vi
			.fn()
			.mockReturnValueOnce(900)
			.mockReturnValueOnce(1_000)
			.mockReturnValueOnce(1_200)
			.mockReturnValueOnce(1_700);
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce({
				taskId: runnable.taskId,
				documentCount: 25,
				requestCount: 1,
				completed: false,
			})
			.mockRejectedValueOnce(new Error('orders unavailable'));

		await runPersistedSchedulerTasks({
			...baseInput,
			repository,
			getNowMs,
			fetcher,
		});

		const renewedState = state({
			mode: 'greedy',
			status: 'in-flight',
			ownerId: 'tab-runner',
			claimedUntilMs: 1_500,
			attempt: 2,
			retryAfterMs: null,
			updatedAtMs: 1_200,
		});
		expect(repository.markFailed).toHaveBeenCalledWith(renewedState, {
			...renewedState,
			status: 'failed',
			ownerId: null,
			claimedUntilMs: null,
			retryAfterMs: 2_200,
			updatedAtMs: 1_700,
		});
	});

	it('uses per-task greedy request limits before the runner-wide default', async () => {
		const runnable = state({ mode: 'greedy', requirementId: 'orders.greedy.once' });
		const repository = createRepository([runnable]);
		const getNowMs = vi
			.fn()
			.mockReturnValueOnce(900)
			.mockReturnValueOnce(1_000)
			.mockReturnValueOnce(1_700);
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce({
				taskId: runnable.taskId,
				documentCount: 25,
				requestCount: 1,
				completed: false,
			})
			.mockResolvedValueOnce({
				taskId: runnable.taskId,
				documentCount: 10,
				requestCount: 1,
				completed: true,
			});

		const result = await runPersistedSchedulerTasks({
			...baseInput,
			repository,
			getNowMs,
			fetcher,
			maxRequestsPerTask: 3,
			maxRequestsForTask: (task) => (task.requirementId === 'orders.greedy.once' ? 1 : undefined),
		});

		const claimedState = state({
			mode: 'greedy',
			requirementId: 'orders.greedy.once',
			status: 'in-flight',
			ownerId: 'tab-runner',
			claimedUntilMs: 1_300,
			attempt: 2,
			retryAfterMs: null,
			updatedAtMs: 1_000,
		});
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(repository.claim).toHaveBeenCalledTimes(1);
		expect(repository.markFailed).toHaveBeenCalledWith(claimedState, {
			...claimedState,
			status: 'failed',
			ownerId: null,
			claimedUntilMs: null,
			retryAfterMs: 2_200,
			updatedAtMs: 1_700,
		});
		expect(result.failed).toBe(1);
		expect(result.totalDocuments).toBe(25);
		expect(result.totalRequests).toBe(1);
	});

	it('passes the caller abort signal to persisted scheduler fetchers', async () => {
		const runnable = state();
		const repository = createRepository([runnable]);
		const abortController = new AbortController();
		const fetcher = vi.fn(async () => ({
			taskId: runnable.taskId,
			documentCount: 25,
			requestCount: 1,
			completed: true,
		}));

		await runPersistedSchedulerTasks({
			...baseInput,
			repository,
			fetcher,
			signal: abortController.signal,
		});

		expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ id: runnable.taskId }), {
			signal: abortController.signal,
		});
	});

	it('stops before claiming the next persisted task when the caller aborts the runner', async () => {
		const first = state({ taskId: 'orders:first', requirementId: 'orders.first' });
		const second = state({ taskId: 'orders:second', requirementId: 'orders.second' });
		const repository = createRepository([first, second]);
		const abortController = new AbortController();
		const fetcher = vi.fn(async (task) => {
			abortController.abort(new Error('runner abandoned'));
			return { taskId: task.id, documentCount: 1, requestCount: 1, completed: true };
		});

		await expect(
			runPersistedSchedulerTasks({
				...baseInput,
				repository,
				fetcher,
				signal: abortController.signal,
			})
		).rejects.toThrow('runner abandoned');

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(repository.claim).toHaveBeenCalledTimes(1);
		expect(repository.completeOrRequeue).toHaveBeenCalledTimes(1);
		expect(repository.markFailed).not.toHaveBeenCalled();
	});

	it('releases the claimed persisted task before propagating a fetch abort', async () => {
		const runnable = state();
		const repository = createRepository([runnable]);
		const abortController = new AbortController();
		const abortReason = new Error('request abandoned');
		const fetcher = vi.fn(async () => {
			abortController.abort(abortReason);
			throw abortReason;
		});

		await expect(
			runPersistedSchedulerTasks({
				...baseInput,
				repository,
				fetcher,
				signal: abortController.signal,
			})
		).rejects.toThrow('request abandoned');

		expect(repository.claim).toHaveBeenCalledTimes(2);
		expect(repository.claim).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ status: 'in-flight', ownerId: 'tab-runner', attempt: 2 }),
			expect.objectContaining({
				status: 'queued',
				ownerId: null,
				claimedUntilMs: null,
				attempt: 2,
				retryAfterMs: null,
				updatedAtMs: 1_000,
			})
		);
		expect(repository.markFailed).not.toHaveBeenCalled();
		expect(repository.completeOrRequeue).not.toHaveBeenCalled();
	});

	it('propagates a fetch abort when releasing the claim loses its CAS', async () => {
		const runnable = state();
		const repository = createRepository([runnable]);
		let persisted = runnable;
		vi.mocked(repository.claim).mockImplementation(async (_expected, next) => {
			if (next.status === 'queued') return false;
			persisted = next;
			return true;
		});
		const abortController = new AbortController();
		const abortReason = new Error('request abandoned');
		const fetcher = vi.fn(async () => {
			abortController.abort(abortReason);
			throw abortReason;
		});

		await expect(
			runPersistedSchedulerTasks({
				...baseInput,
				repository,
				fetcher,
				signal: abortController.signal,
			})
		).rejects.toBe(abortReason);

		expect(repository.claim).toHaveBeenCalledTimes(2);
		expect(persisted).toMatchObject({
			status: 'in-flight',
			ownerId: 'tab-runner',
			claimedUntilMs: 1_300,
		});
		expect(repository.markFailed).not.toHaveBeenCalled();
	});

	it('releases rather than renewing an incomplete greedy task after aborting during fetch work', async () => {
		const runnable = state({ mode: 'greedy' });
		const repository = createRepository([runnable]);
		const abortController = new AbortController();
		const fetcher = vi.fn(async (task) => {
			abortController.abort(new Error('runner abandoned during batch'));
			return { taskId: task.id, documentCount: 25, requestCount: 1, completed: false };
		});

		await expect(
			runPersistedSchedulerTasks({
				...baseInput,
				repository,
				fetcher,
				signal: abortController.signal,
			})
		).rejects.toThrow('runner abandoned during batch');

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(repository.claim).toHaveBeenCalledTimes(2);
		expect(repository.claim).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ status: 'in-flight' }),
			expect.objectContaining({ status: 'queued', ownerId: null, claimedUntilMs: null })
		);
		expect(repository.markFailed).not.toHaveBeenCalled();
		expect(repository.completeOrRequeue).not.toHaveBeenCalled();
	});
});

describe('lease heartbeat during a slow fetch', () => {
	// The livelock this pins (2026-08-12 HAR, dev-next): one page fetch on a starved server
	// took as long as the whole 30s lease. Between-page renewal never got a turn, a rival
	// drain claimed the row mid-fetch, both owners walked the same window concurrently, and
	// the loser's completion CAS failed — so the task never retired and the walks repeated,
	// keeping the server pinned. The heartbeat renews DURING the fetch, so a lease expiry
	// once again means its owner is actually gone.

	/** A CAS repository over a real row map, so rival runners contend like RxDB revisions. */
	function casRepository(initial: PersistedSchedulerTaskState[]) {
		const rows = new Map(initial.map((row) => [row.taskId, row]));
		const matches = (expected: PersistedSchedulerTaskState): boolean => {
			const current = rows.get(expected.taskId);
			return current !== undefined && JSON.stringify(current) === JSON.stringify(expected);
		};
		return {
			rows,
			readRunnable: vi.fn(async (nowMs: number) =>
				[...rows.values()].filter(
					(row) =>
						row.status === 'queued' ||
						(row.status === 'failed' && (row.retryAfterMs ?? 0) <= nowMs) ||
						(row.status === 'in-flight' && (row.claimedUntilMs ?? 0) <= nowMs)
				)
			),
			claim: vi.fn(
				async (expected: PersistedSchedulerTaskState, next: PersistedSchedulerTaskState) => {
					if (!matches(expected)) return false;
					rows.set(next.taskId, next);
					return true;
				}
			),
			completeOrRequeue: vi.fn(
				async (expected: PersistedSchedulerTaskState, completed: PersistedSchedulerTaskState) => {
					if (!matches(expected)) return 'claim-lost' as const;
					rows.set(completed.taskId, completed);
					return 'completed' as const;
				}
			),
			markFailed: vi.fn(
				async (expected: PersistedSchedulerTaskState, failed: PersistedSchedulerTaskState) => {
					if (!matches(expected)) return false;
					rows.set(failed.taskId, failed);
					return true;
				}
			),
		};
	}

	function runnerInput(ownerId: string) {
		return {
			ownerId,
			nowMs: Date.now(),
			getNowMs: () => Date.now(),
			leaseForMs: 30_000,
			retryAfterMs: 5_000,
		};
	}

	function queuedRow(overrides: Partial<PersistedSchedulerTaskState> = {}) {
		return state({
			taskId: 'products:browse:windowed',
			collection: 'products',
			queryKey: 'products:browse',
			status: 'queued',
			ownerId: null,
			claimedUntilMs: null,
			retryAfterMs: null,
			attempt: 0,
			...overrides,
		});
	}

	it('keeps the claim fresh while one fetch outlives the lease, so a rival drain cannot steal it', async () => {
		vi.useFakeTimers();
		try {
			const row = queuedRow();
			const repository = casRepository([row]);
			const fetcher = vi.fn(
				(task: { id: string }) =>
					new Promise<{
						taskId: string;
						documentCount: number;
						requestCount: number;
						completed: boolean;
					}>((resolve) =>
						setTimeout(
							() =>
								resolve({ taskId: task.id, documentCount: 25, requestCount: 1, completed: true }),
							45_000
						)
					)
			);
			const run = runPersistedSchedulerTasks({ ...runnerInput('tab-a'), repository, fetcher });

			// 35s in: the initial 30s lease has lapsed by wall clock; only in-fetch
			// heartbeats can have kept the row claimed.
			await vi.advanceTimersByTimeAsync(35_000);
			const rivalFetcher = vi.fn(async (task: { id: string }) => ({
				taskId: task.id,
				documentCount: 0,
				requestCount: 1,
				completed: true,
			}));
			const rival = await runPersistedSchedulerTasks({
				...runnerInput('tab-b'),
				repository,
				fetcher: rivalFetcher,
			});
			expect(rival.scanned).toBe(0);
			expect(rivalFetcher).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(10_000);
			const result = await run;
			expect(result).toMatchObject({ succeeded: 1, completionLost: 0, renewalLost: 0 });
			expect(repository.rows.get(row.taskId)).toMatchObject({ status: 'completed', ownerId: null });
			expect(fetcher).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it('beats inside a sub-second lease too — the interval is derived, never floored past it', async () => {
		// #1175 review P2: a 1s floor on the interval scheduled the FIRST beat after a
		// short lease had already expired, re-opening the steal window for exactly the
		// lease sizes the tests run at.
		vi.useFakeTimers();
		try {
			const row = queuedRow();
			const repository = casRepository([row]);
			const fetcher = vi.fn(
				(task: { id: string }) =>
					new Promise<{
						taskId: string;
						documentCount: number;
						requestCount: number;
						completed: boolean;
					}>((resolve) =>
						setTimeout(
							() =>
								resolve({ taskId: task.id, documentCount: 1, requestCount: 1, completed: true }),
							500
						)
					)
			);
			const run = runPersistedSchedulerTasks({
				...runnerInput('tab-a'),
				leaseForMs: 300,
				repository,
				fetcher,
			});
			// 400ms in: the 300ms lease has lapsed by wall clock; only sub-lease beats
			// (100ms cadence) can have kept the row claimed.
			await vi.advanceTimersByTimeAsync(400);
			const rival = await runPersistedSchedulerTasks({
				...runnerInput('tab-b'),
				leaseForMs: 300,
				repository,
				fetcher: vi.fn(async (task: { id: string }) => ({
					taskId: task.id,
					documentCount: 0,
					requestCount: 1,
					completed: true,
				})),
			});
			expect(rival.scanned).toBe(0);
			await vi.advanceTimersByTimeAsync(200);
			await expect(run).resolves.toMatchObject({ succeeded: 1, renewalLost: 0 });
		} finally {
			vi.useRealTimers();
		}
	});

	it('stops as renewal-lost — never contesting completion — when the claim is taken mid-fetch', async () => {
		vi.useFakeTimers();
		try {
			const row = queuedRow({ mode: 'greedy' });
			const repository = casRepository([row]);
			let resolveFetch:
				| ((result: {
						taskId: string;
						documentCount: number;
						requestCount: number;
						completed: boolean;
				  }) => void)
				| undefined;
			const fetcher = vi.fn(
				() =>
					new Promise<{
						taskId: string;
						documentCount: number;
						requestCount: number;
						completed: boolean;
					}>((resolve) => {
						resolveFetch = resolve;
					})
			);
			const run = runPersistedSchedulerTasks({ ...runnerInput('tab-a'), repository, fetcher });
			await vi.advanceTimersByTimeAsync(5_000);
			expect(resolveFetch).toBeDefined();

			// A rival's claim CAS won during a beat gap (its clock saw the lease lapse).
			const stolen = {
				...repository.rows.get(row.taskId)!,
				ownerId: 'tab-b',
				claimedUntilMs: Date.now() + 30_000,
				updatedAtMs: Date.now(),
			};
			repository.rows.set(row.taskId, stolen);

			// The next heartbeat discovers the loss …
			await vi.advanceTimersByTimeAsync(10_000);
			// … and the fetch that eventually lands must not walk on or contest completion.
			resolveFetch!({ taskId: row.taskId, documentCount: 25, requestCount: 1, completed: true });
			const result = await run;

			expect(result).toMatchObject({ renewalLost: 1, completionLost: 0, succeeded: 0, failed: 0 });
			expect(result.tasks).toEqual([
				expect.objectContaining({ kind: 'renewal-lost', documents: 25, requests: 1 }),
			]);
			expect(repository.completeOrRequeue).not.toHaveBeenCalled();
			expect(fetcher).toHaveBeenCalledTimes(1);
			// The thief's row is exactly as it left it — the loser wrote nothing after losing.
			expect(repository.rows.get(row.taskId)).toEqual(stolen);
		} finally {
			vi.useRealTimers();
		}
	});
});
