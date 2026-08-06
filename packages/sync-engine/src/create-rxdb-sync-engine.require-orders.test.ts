/**
 * Slice 5f: require() covers ORDERS through the DURABLE path — a persisted
 * targeted task the scheduler drain completes — driven entirely through the
 * public handle against a scripted /orders proxy.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	createRxdbSyncEngine,
	type RxdbSyncEngine,
	type StoreScopeIdentity,
} from './create-rxdb-sync-engine';
import { createRequirePlane } from './require-plane';
import * as orderTaskSeeder from './scheduler/rx-order-scheduler-task-seeder';
import * as schedulerDrain from './scheduler/engine-scheduler-drain';
import { memoryEngineStorage } from './testing';

import type { PersistedSchedulerTaskOutcomeKind } from './scheduler';

const SITE = 'https://lab.example.test';
const SYNC_BASE = `${SITE}/wp-json/wcpos/v2`;
const UUID_7 = '77777777-7777-4777-8777-777777777777';
let uniqueStore = 0;

/** The single task the mocked seeders own in this file. */
const OWNED_TASK_ID = 'orders:owned:windowed';

/** The aggregate counter each loss kind used to be reported through. */
const LOSS_KIND = {
	claimLost: 'claim-lost',
	completionLost: 'completion-lost',
	failureLost: 'failure-lost',
	renewalLost: 'renewal-lost',
} as const satisfies Record<string, PersistedSchedulerTaskOutcomeKind>;

/** A per-task drain verdict for {@link OWNED_TASK_ID}. */
const ownedTask = (
	kind: PersistedSchedulerTaskOutcomeKind,
	counts: { documents?: number; requests?: number } = {}
) => ({
	taskId: OWNED_TASK_ID,
	requirementId: 'orders.owned',
	collection: 'orders',
	queryKey: 'orders:owned',
	kind,
	documents: counts.documents ?? 0,
	requests: counts.requests ?? 0,
});

const EMPTY_SEED_RESULT = {
	inserted: 0,
	requeued: 0,
	skippedActive: 0,
	skippedCompleted: 0,
	skippedRunnable: 0,
	claimLost: 0,
	rerunRequested: 0,
	// Every mocked seed claims this one task, so a mocked drain result can be attributed to
	// the requirement that seeded it — which is what the per-task outcome contract reads.
	taskIds: [OWNED_TASK_ID, `${OWNED_TASK_ID}:2`],
};

const EMPTY_DRAIN_RESULT = {
	scanned: 0,
	claimLost: 0,
	completionLost: 0,
	succeeded: 0,
	coalescedReruns: 0,
	failed: 0,
	failureLost: 0,
	renewalLost: 0,
	totalDocuments: 0,
	totalRequests: 0,
	ledgerRebuilt: false,
	tasks: [],
};

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function freshIdentity(): StoreScopeIdentity {
	uniqueStore += 1;
	return { site: SITE, storeId: 3, cashierId: `req-orders-${uniqueStore}` };
}

function scriptedOrderProxy() {
	const state = { pulls: 0 };
	const fetch = async (url: string): Promise<Response> => {
		const u = new URL(url);
		if (u.pathname.endsWith('/orders')) {
			state.pulls += 1;
			const include = (u.searchParams.get('include') ?? '').split(',').map(Number).filter(Boolean);
			return new Response(
				JSON.stringify(
					include.map((id) => ({
						id,
						number: String(1000 + id),
						status: 'processing',
						total: '5.00',
						date_created_gmt: '2026-07-10T00:00:00',
						date_modified_gmt: '2026-07-10T00:00:01',
						customer_id: 0,
						meta_data: [{ id: 1, key: '_woocommerce_pos_uuid', value: UUID_7 }],
					}))
				),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		}
		throw new Error(`scripted proxy: unexpected ${u.pathname}`);
	};
	return { state, fetch };
}

function scriptedGreedyOrderProxy(batchCount: number) {
	const state = { pulls: 0 };
	const fetch = async (url: string): Promise<Response> => {
		const u = new URL(url);
		if (!u.pathname.endsWith('/orders/pull')) {
			return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
		}
		state.pulls += 1;
		const id = state.pulls;
		const checkpoint = {
			updatedAtGmt: '2026-07-10T00:00:01.000Z',
			orderId: id,
			revision: `revision-${id}`,
			sequence: id,
		};
		return new Response(
			JSON.stringify({
				documents: [
					{
						id: `77777777-7777-4777-8777-${String(id).padStart(12, '0')}`,
						wooOrderId: id,
						payload: {
							id,
							date_modified_gmt: checkpoint.updatedAtGmt,
							meta_data: [
								{
									key: '_woocommerce_pos_uuid',
									value: `77777777-7777-4777-8777-${String(id).padStart(12, '0')}`,
								},
							],
						},
						sync: {
							revision: checkpoint.revision,
							partial: false,
							source: 'custom-pull',
							checkpoint,
						},
						local: { dirty: false, pendingMutationIds: [] },
					},
				],
				checkpoint,
				hasMore: state.pulls < batchCount,
			}),
			{ status: 200, headers: { 'content-type': 'application/json' } }
		);
	};
	return { state, fetch };
}

function engineWith(fetch: (url: string, init?: RequestInit) => Promise<Response>): RxdbSyncEngine {
	return createRxdbSyncEngine(
		{
			site: { syncBaseUrl: SYNC_BASE, wpJsonRoot: `${SITE}/wp-json` },
			storage: memoryEngineStorage(),
			fetcher: (url, init) => fetch(url, init),
			mode: 'manual',
		},
		freshIdentity()
	);
}

describe('require() for orders (slice 5f — the durable path)', () => {
	it('completes a required full refresh that needs more than 100 greedy batches', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = scriptedGreedyOrderProxy(101);
		const engine = engineWith(server.fetch);
		await engine.ready;

		const outcome = await engine.require({
			id: 'large-manual-order-sync',
			collection: 'orders',
			kind: 'refresh',
			limit: 1,
			forceRefresh: true,
		}).ready;

		expect(outcome).toMatchObject({ action: 'fetched', documents: 101 });
		expect(outcome.requests).toBeGreaterThan(100);
		expect(server.state.pulls).toBe(101);
		await engine.dispose();
	});

	it('pulls a missing order via a persisted task + drain, then serves local without a second fetch', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = scriptedOrderProxy();
		const engine = engineWith(server.fetch);
		await engine.ready;

		const first = await engine.require({
			id: 'pos-open-order',
			collection: 'orders',
			kind: 'targeted-records',
			wooIds: [7],
		}).ready;
		expect(first.action).toBe('fetched');
		expect(first.missingRecordIds).toEqual([7]);
		expect(server.state.pulls).toBeGreaterThan(0);

		const scope = engine.active();
		if (!scope) throw new Error('no active scope');
		const orders = await (
			scope.database.collections.orders as {
				find(): { exec(): Promise<{ toJSON(): Record<string, unknown> }[]> };
			}
		)
			.find()
			.exec();
		expect(orders.map((doc) => doc.toJSON()['wooOrderId'])).toEqual([7]);

		const pullsBefore = server.state.pulls;
		const second = await engine.require({
			id: 'pos-open-order',
			collection: 'orders',
			kind: 'targeted-records',
			wooIds: [7],
		}).ready;
		expect(second.action).toBe('serve-local');
		expect(server.state.pulls).toBe(pullsBefore); // resident — no second fetch
		await engine.dispose();
	});

	it('force-refreshes a resident order when the caller requires a re-fetch', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = scriptedOrderProxy();
		const engine = engineWith(server.fetch);
		await engine.ready;

		await engine.require({
			id: 'resident',
			collection: 'orders',
			kind: 'targeted-records',
			wooIds: [7],
		}).ready;
		const pullsBefore = server.state.pulls;
		const refreshed = await engine.require({
			id: 're-anchor',
			collection: 'orders',
			kind: 'targeted-records',
			wooIds: [7],
			forceRefresh: true,
		}).ready;

		expect(refreshed.action).toBe('fetched');
		expect(server.state.pulls).toBeGreaterThan(pullsBefore);
		await engine.dispose();
	});

	function orchestrationHarness(now?: () => number) {
		let residentOrderIds: number[] = [];
		const rawFetch = vi.fn(async () => new Response());
		const boundFetch = vi.fn(async () => new Response());
		const guardWrite = vi.fn(async (write: () => Promise<void>) => {
			await write();
			return 'applied' as const;
		});
		const bound = {
			scopeId: 'scope-a',
			epoch: 1,
			bindFetch: vi.fn(() => boundFetch),
			guardWrite,
			isCurrent: vi.fn(() => true),
		};
		const database = {
			collections: {
				orders: {
					find: () => ({
						exec: async () =>
							residentOrderIds.map((wooOrderId) => ({
								toJSON: () => ({ wooOrderId }),
							})),
					}),
				},
			},
		};
		const diagnostics = vi.fn();
		const plane = createRequirePlane({
			awaitReady: async () => undefined,
			manager: {
				runGuarded: async (operation: (captured: typeof bound) => Promise<unknown>) =>
					operation(bound),
			} as never,
			databaseFor: () => database as never,
			coverageFor: () =>
				({
					recordQueryResult: vi.fn(async () => undefined),
					recordRecords: vi.fn(async () => undefined),
					recordCumulativeQueryResult: vi.fn(async () => undefined),
					readLane: vi.fn(async () => null),
				}) as never,
			fetcher: rawFetch,
			syncBaseUrl: SYNC_BASE,
			diagnostics,
			...(now ? { now } : {}),
		});

		return {
			plane,
			rawFetch,
			boundFetch,
			diagnostics,
			setResidentOrderIds: (ids: number[]) => {
				residentOrderIds = ids;
			},
		};
	}

	it('disables completed-task dedupe when a required order is absent', async () => {
		const harness = orchestrationHarness();
		const seed = vi
			.spyOn(orderTaskSeeder, 'seedTargetedOrderSchedulerTask')
			.mockResolvedValue({ ...EMPTY_SEED_RESULT, requeued: 1 });
		vi.spyOn(schedulerDrain, 'runEngineSchedulerDrain').mockImplementation(async () => {
			harness.setResidentOrderIds([8]);
			return { ...EMPTY_DRAIN_RESULT, succeeded: 1, tasks: [ownedTask('succeeded')] };
		});

		await harness.plane.require({
			id: 'dedupe',
			collection: 'orders',
			kind: 'targeted-records',
			wooIds: [8],
		}).ready;

		expect(seed).toHaveBeenCalledWith(expect.objectContaining({ completedDedupeForMs: 0 }));
	});

	it('runs the durable order drain with the scope-bound fetcher', async () => {
		const harness = orchestrationHarness();
		vi.spyOn(orderTaskSeeder, 'seedTargetedOrderSchedulerTask').mockResolvedValue({
			...EMPTY_SEED_RESULT,
			inserted: 1,
		});
		const drain = vi
			.spyOn(schedulerDrain, 'runEngineSchedulerDrain')
			.mockImplementation(async () => {
				harness.setResidentOrderIds([8]);
				return { ...EMPTY_DRAIN_RESULT, succeeded: 1, tasks: [ownedTask('succeeded')] };
			});

		await harness.plane.require({
			id: 'bound-fetch',
			collection: 'orders',
			kind: 'targeted-records',
			wooIds: [8],
		}).ready;

		expect(drain).toHaveBeenCalledWith(expect.objectContaining({ fetcher: expect.any(Function) }));
	});

	it('routes a typed order browse requirement through the persisted query path', async () => {
		const harness = orchestrationHarness();
		const seed = vi
			.spyOn(orderTaskSeeder, 'seedOrderFilterSchedulerTask')
			.mockResolvedValue({ ...EMPTY_SEED_RESULT, inserted: 1 });
		vi.spyOn(schedulerDrain, 'runEngineSchedulerDrain').mockResolvedValue({
			...EMPTY_DRAIN_RESULT,
			succeeded: 1,
			tasks: [ownedTask('succeeded')],
		});

		const handle = harness.plane.require({
			id: 'processing-orders',
			collection: 'orders',
			kind: 'orders-browse',
			status: 'processing',
			limit: 50,
		});
		expect(handle.queryKey).toBe('orders:browser:status=processing:search=:limit=50');
		await handle.ready;

		expect(seed).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: 'orders:browser:status=processing:search=:limit=50',
				status: 'processing',
				search: '',
				limit: 50,
			})
		);
	});

	it('throws typed order browse misuse synchronously', () => {
		const harness = orchestrationHarness();
		expect(() =>
			harness.plane.require({
				id: 'invalid-status',
				collection: 'orders',
				kind: 'orders-browse',
				status: '',
			})
		).toThrow(TypeError);
		expect(() =>
			harness.plane.require({
				id: 'invalid-complete',
				collection: 'orders',
				kind: 'orders-browse',
				limit: 'all',
			})
		).toThrow(TypeError);
		expect(() =>
			harness.plane.require({
				id: 'invalid-sort',
				collection: 'orders',
				kind: 'orders-browse',
				orderby: 'date',
			})
		).toThrow(TypeError);
	});

	it('routes a full order refresh through the persisted greedy seeder and drain', async () => {
		const harness = orchestrationHarness();
		const seed = vi
			.spyOn(orderTaskSeeder, 'seedOrderSchedulerTasks')
			.mockResolvedValue({ ...EMPTY_SEED_RESULT, inserted: 1 });
		vi.spyOn(schedulerDrain, 'runEngineSchedulerDrain').mockResolvedValue({
			...EMPTY_DRAIN_RESULT,
			succeeded: 1,
			totalDocuments: 25,
			totalRequests: 2,
			tasks: [ownedTask('succeeded', { documents: 25, requests: 2 })],
		});

		const handle = harness.plane.require({
			id: 'manual-order-sync',
			collection: 'orders',
			kind: 'refresh',
			limit: 250,
			forceRefresh: true,
		});
		expect(handle.queryKey).toBeNull();
		const outcome = await handle.ready;

		expect(seed).toHaveBeenCalledWith(
			expect.objectContaining({ perPage: 250, completedDedupeForMs: 0 })
		);
		expect(outcome).toMatchObject({ action: 'fetched', documents: 25, requests: 2 });
	});

	it('emits per-batch foreground drain progress and the cumulative require outcome', async () => {
		const harness = orchestrationHarness();
		vi.spyOn(orderTaskSeeder, 'seedOrderSchedulerTasks').mockResolvedValue({
			...EMPTY_SEED_RESULT,
			inserted: 1,
		});
		vi.spyOn(schedulerDrain, 'runEngineSchedulerDrain').mockImplementation(async (input) => {
			input.onProgress?.({ collection: 'orders', documents: 20, requests: 1 });
			input.onProgress?.({ collection: 'orders', documents: 35, requests: 2 });
			return {
				...EMPTY_DRAIN_RESULT,
				succeeded: 1,
				totalDocuments: 35,
				totalRequests: 2,
				tasks: [ownedTask('succeeded', { documents: 35, requests: 2 })],
			};
		});

		await harness.plane.require({ id: 'manual-sync', collection: 'orders', kind: 'refresh' }).ready;

		const events = harness.diagnostics.mock.calls.map(([event]) => event);
		expect(
			events.filter((event) => event.type === 'queue.drain.progress').map((event) => event.fields)
		).toEqual([
			{ requirementId: 'manual-sync', documents: 20, requests: 1 },
			{ requirementId: 'manual-sync', documents: 15, requests: 1 },
		]);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: 'coverage.require.outcome',
				fields: expect.objectContaining({
					action: 'fetched',
					documents: 35,
					requests: 2,
					durationMs: expect.any(Number),
				}),
			})
		);
	});

	it.each([
		{
			label: 'browse',
			requirement: {
				id: 'active-browse',
				collection: 'orders' as const,
				kind: 'orders-browse' as const,
				status: 'processing',
				limit: 50,
			},
			seed: () => vi.spyOn(orderTaskSeeder, 'seedOrderFilterSchedulerTask'),
		},
		{
			label: 'refresh',
			requirement: {
				id: 'active-refresh',
				collection: 'orders' as const,
				kind: 'refresh' as const,
				limit: 25,
			},
			seed: () => vi.spyOn(orderTaskSeeder, 'seedOrderSchedulerTasks'),
		},
	])(
		'reports a released outcome when an order $label task is actively owned elsewhere',
		async ({ requirement, seed }) => {
			const harness = orchestrationHarness();
			seed().mockResolvedValue({ ...EMPTY_SEED_RESULT, skippedActive: 1 });
			const drain = vi
				.spyOn(schedulerDrain, 'runEngineSchedulerDrain')
				.mockResolvedValue(EMPTY_DRAIN_RESULT);

			const outcome = await harness.plane.require(requirement).ready;

			expect(outcome).toMatchObject({ action: 'released' });
			expect(outcome.reason).toMatch(/already in progress/i);
			expect(drain).not.toHaveBeenCalled();
			expect(
				harness.diagnostics.mock.calls.some(
					([event]) => event.type === 'coverage.gate.hit' || event.type === 'coverage.gate.miss'
				)
			).toBe(false);
		}
	);

	it.each([
		['claimLost', 'browse'],
		['completionLost', 'browse'],
		['failureLost', 'browse'],
		['renewalLost', 'browse'],
		['claimLost', 'refresh'],
		['completionLost', 'refresh'],
		['failureLost', 'refresh'],
		['renewalLost', 'refresh'],
	] as const)('releases an order %s drain loss for a %s requirement', async (lossCounter, kind) => {
		const harness = orchestrationHarness();
		if (kind === 'browse') {
			vi.spyOn(orderTaskSeeder, 'seedOrderFilterSchedulerTask').mockResolvedValue({
				...EMPTY_SEED_RESULT,
				inserted: 1,
			});
		} else {
			vi.spyOn(orderTaskSeeder, 'seedOrderSchedulerTasks').mockResolvedValue({
				...EMPTY_SEED_RESULT,
				inserted: 1,
			});
		}
		vi.spyOn(schedulerDrain, 'runEngineSchedulerDrain').mockResolvedValue({
			...EMPTY_DRAIN_RESULT,
			[lossCounter]: 1,
			tasks: [ownedTask(LOSS_KIND[lossCounter])],
		});

		const requirement =
			kind === 'browse'
				? {
						id: `lost-${lossCounter}`,
						collection: 'orders' as const,
						kind: 'orders-browse' as const,
						status: 'processing',
						limit: 50,
					}
				: { id: `lost-${lossCounter}`, collection: 'orders' as const, kind };
		await expect(harness.plane.require(requirement).ready).resolves.toMatchObject({
			action: 'released',
			reason: expect.stringMatching(/claim lost to another owner/i),
			documents: 0,
			requests: 0,
		});
	});

	it.each(['browse', 'refresh'] as const)(
		'releases an order %s requirement when a ledger rebuild aborted the drain tick',
		async (kind) => {
			const harness = orchestrationHarness();
			if (kind === 'browse') {
				vi.spyOn(orderTaskSeeder, 'seedOrderFilterSchedulerTask').mockResolvedValue({
					...EMPTY_SEED_RESULT,
					inserted: 1,
				});
			} else {
				vi.spyOn(orderTaskSeeder, 'seedOrderSchedulerTasks').mockResolvedValue({
					...EMPTY_SEED_RESULT,
					inserted: 1,
				});
			}
			// #956: the tick was dropped mid-flight by the derivable-ledger rebuild, so
			// nothing was claimed or fetched — the caller must not be told it was fetched.
			vi.spyOn(schedulerDrain, 'runEngineSchedulerDrain').mockResolvedValue({
				...EMPTY_DRAIN_RESULT,
				ledgerRebuilt: true,
			});

			const requirement =
				kind === 'browse'
					? {
							id: 'ledger-rebuilt-browse',
							collection: 'orders' as const,
							kind: 'orders-browse' as const,
							status: 'processing',
							limit: 50,
						}
					: { id: 'ledger-rebuilt-refresh', collection: 'orders' as const, kind };
			await expect(harness.plane.require(requirement).ready).resolves.toMatchObject({
				action: 'released',
				reason: expect.stringMatching(/local sync bookkeeping was rebuilt/i),
			});
		}
	);

	it.each(['browse', 'refresh'] as const)(
		'releases an order %s drain loss after partial progress with its aggregates',
		async (kind) => {
			const harness = orchestrationHarness();
			if (kind === 'browse') {
				vi.spyOn(orderTaskSeeder, 'seedOrderFilterSchedulerTask').mockResolvedValue({
					...EMPTY_SEED_RESULT,
					inserted: 1,
				});
			} else {
				vi.spyOn(orderTaskSeeder, 'seedOrderSchedulerTasks').mockResolvedValue({
					...EMPTY_SEED_RESULT,
					inserted: 1,
				});
			}
			vi.spyOn(schedulerDrain, 'runEngineSchedulerDrain').mockResolvedValue({
				...EMPTY_DRAIN_RESULT,
				succeeded: 1,
				completionLost: 1,
				totalDocuments: 17,
				totalRequests: 3,
				// Partial progress: one of this requirement's tasks landed, another lost its row.
				tasks: [
					ownedTask('succeeded', { documents: 17, requests: 3 }),
					{ ...ownedTask('completion-lost'), taskId: `${OWNED_TASK_ID}:2` },
				],
			});

			const requirement =
				kind === 'browse'
					? {
							id: 'partial-lost-browse',
							collection: 'orders' as const,
							kind: 'orders-browse' as const,
							status: 'processing',
							limit: 50,
						}
					: { id: 'partial-lost-refresh', collection: 'orders' as const, kind };
			await expect(harness.plane.require(requirement).ready).resolves.toMatchObject({
				action: 'released',
				documents: 17,
				requests: 3,
			});
		}
	);

	it.each(['browse', 'refresh'] as const)('rejects a failed order %s drain', async (kind) => {
		const harness = orchestrationHarness();
		if (kind === 'browse') {
			vi.spyOn(orderTaskSeeder, 'seedOrderFilterSchedulerTask').mockResolvedValue({
				...EMPTY_SEED_RESULT,
				inserted: 1,
			});
		} else {
			vi.spyOn(orderTaskSeeder, 'seedOrderSchedulerTasks').mockResolvedValue({
				...EMPTY_SEED_RESULT,
				inserted: 1,
			});
		}
		vi.spyOn(schedulerDrain, 'runEngineSchedulerDrain').mockResolvedValue({
			...EMPTY_DRAIN_RESULT,
			failed: 1,
			tasks: [ownedTask('failed')],
		});

		const requirement =
			kind === 'browse'
				? {
						id: 'failed-browse',
						collection: 'orders' as const,
						kind: 'orders-browse' as const,
						status: 'processing',
						limit: 50,
					}
				: { id: 'failed-refresh', collection: 'orders' as const, kind };
		await expect(harness.plane.require(requirement).ready).rejects.toThrow(
			/scheduler drain failed 1 task/i
		);
		expect(harness.diagnostics.mock.calls.map(([event]) => event)).toContainEqual(
			expect.objectContaining({
				type: 'coverage.require.error',
				message: 'require: scheduler drain failed 1 task(s)',
			})
		);
	});

	it('release aborts an in-flight foreground order drain and settles as released', async () => {
		const harness = orchestrationHarness();
		vi.spyOn(orderTaskSeeder, 'seedOrderSchedulerTasks').mockResolvedValue({
			...EMPTY_SEED_RESULT,
			inserted: 1,
		});
		let observedSignal: AbortSignal | undefined;
		vi.spyOn(schedulerDrain, 'runEngineSchedulerDrain').mockImplementation(async (input) => {
			observedSignal = input.signal;
			return await new Promise<never>((_resolve, reject) => {
				input.signal?.addEventListener('abort', () => reject(input.signal?.reason), { once: true });
			});
		});

		const handle = harness.plane.require({
			id: 'slow-refresh',
			collection: 'orders',
			kind: 'refresh',
		});
		await vi.waitFor(() => expect(observedSignal).toBeDefined());
		handle.release();

		await expect(handle.ready).resolves.toMatchObject({
			action: 'released',
			reason: 'released during drain',
		});
		expect(observedSignal?.aborted).toBe(true);
	});

	it('release aborts an in-flight targeted order drain and frees the pump for the next requirement', async () => {
		const harness = orchestrationHarness();
		vi.spyOn(orderTaskSeeder, 'seedTargetedOrderSchedulerTask').mockResolvedValue({
			...EMPTY_SEED_RESULT,
			inserted: 1,
		});
		let observedSignal: AbortSignal | undefined;
		let calls = 0;
		vi.spyOn(schedulerDrain, 'runEngineSchedulerDrain').mockImplementation(async (input) => {
			calls += 1;
			if (calls === 1) {
				observedSignal = input.signal;
				return await new Promise<never>((_resolve, reject) => {
					input.signal?.addEventListener('abort', () => reject(input.signal?.reason), {
						once: true,
					});
				});
			}
			harness.setResidentOrderIds([9]);
			return { ...EMPTY_DRAIN_RESULT, succeeded: 1, tasks: [ownedTask('succeeded')] };
		});

		const slow = harness.plane.require({
			id: 'slow-targeted',
			collection: 'orders',
			kind: 'targeted-records',
			wooIds: [8],
		});
		const next = harness.plane.require({
			id: 'next-targeted',
			collection: 'orders',
			kind: 'targeted-records',
			wooIds: [9],
		});
		await vi.waitFor(() => expect(observedSignal).toBeDefined());
		slow.release();

		await expect(slow.ready).resolves.toMatchObject({
			action: 'released',
			reason: 'released during drain',
		});
		await expect(next.ready).resolves.toMatchObject({ action: 'fetched' });
		expect(observedSignal?.aborted).toBe(true);
	});

	it('rejects ready when the durable order drain fails and the order remains absent', async () => {
		vi.spyOn(orderTaskSeeder, 'seedTargetedOrderSchedulerTask').mockResolvedValue({
			...EMPTY_SEED_RESULT,
			inserted: 1,
		});
		vi.spyOn(schedulerDrain, 'runEngineSchedulerDrain').mockResolvedValue({
			...EMPTY_DRAIN_RESULT,
			scanned: 1,
			failed: 1,
			tasks: [ownedTask('failed')],
		});
		const harness = orchestrationHarness();

		await expect(
			harness.plane.require({
				id: 'failed',
				collection: 'orders',
				kind: 'targeted-records',
				wooIds: [8],
			}).ready
		).rejects.toThrow(/scheduler drain failed/i);
	});

	it('waits for an identical active task to make the required order resident', async () => {
		vi.spyOn(orderTaskSeeder, 'seedTargetedOrderSchedulerTask').mockResolvedValue({
			...EMPTY_SEED_RESULT,
			skippedActive: 1,
		});
		vi.spyOn(schedulerDrain, 'runEngineSchedulerDrain').mockResolvedValue(EMPTY_DRAIN_RESULT);
		const harness = orchestrationHarness();
		const ready = harness.plane.require({
			id: 'active',
			collection: 'orders',
			kind: 'targeted-records',
			wooIds: [8],
		}).ready;

		const early = await Promise.race([
			ready.then(() => 'settled'),
			new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 0)),
		]);
		expect(early).toBe('pending');

		harness.setResidentOrderIds([8]);
		await expect(ready).resolves.toMatchObject({ action: 'fetched', missingRecordIds: [8] });
	});

	it('uses the injected clock for targeted order seeding and draining', async () => {
		const nowMs = 12_345;
		const seed = vi
			.spyOn(orderTaskSeeder, 'seedTargetedOrderSchedulerTask')
			.mockResolvedValue({ ...EMPTY_SEED_RESULT, inserted: 1 });
		const harness = orchestrationHarness(() => nowMs);
		const drain = vi
			.spyOn(schedulerDrain, 'runEngineSchedulerDrain')
			.mockImplementation(async () => {
				harness.setResidentOrderIds([8]);
				return { ...EMPTY_DRAIN_RESULT, succeeded: 1, tasks: [ownedTask('succeeded')] };
			});

		await harness.plane.require({
			id: 'injected-clock',
			collection: 'orders',
			kind: 'targeted-records',
			wooIds: [8],
		}).ready;

		expect(seed).toHaveBeenCalledWith(expect.objectContaining({ nowMs }));
		expect(drain).toHaveBeenCalledWith(expect.objectContaining({ nowMs }));
	});

	it('times out when an identical active task never makes the required order resident', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		const seed = vi
			.spyOn(orderTaskSeeder, 'seedTargetedOrderSchedulerTask')
			.mockResolvedValue({ ...EMPTY_SEED_RESULT, skippedActive: 1 });
		const drain = vi
			.spyOn(schedulerDrain, 'runEngineSchedulerDrain')
			.mockResolvedValue(EMPTY_DRAIN_RESULT);
		const harness = orchestrationHarness();
		const ready = harness.plane.require({
			id: 'active-timeout',
			collection: 'orders',
			kind: 'targeted-records',
			wooIds: [8],
		}).ready;
		const rejected = expect(ready).rejects.toThrow(/timed out waiting for an active order task/i);

		await vi.advanceTimersByTimeAsync(20);
		vi.setSystemTime(schedulerDrain.ORDER_SCHEDULER_LEASE_FOR_MS * 2);
		await vi.advanceTimersByTimeAsync(50);

		await rejected;
		expect(seed).toHaveBeenCalledTimes(1);
		expect(drain).toHaveBeenCalledTimes(1);
	});

	it('backs off while waiting for an active targeted order task', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		vi.spyOn(orderTaskSeeder, 'seedTargetedOrderSchedulerTask').mockResolvedValue({
			...EMPTY_SEED_RESULT,
			skippedActive: 1,
		});
		const drain = vi
			.spyOn(schedulerDrain, 'runEngineSchedulerDrain')
			.mockResolvedValue(EMPTY_DRAIN_RESULT);
		const harness = orchestrationHarness(() => Date.now());
		const ready = harness.plane.require({
			id: 'active-backoff',
			collection: 'orders',
			kind: 'targeted-records',
			wooIds: [8],
		}).ready;
		const rejected = expect(ready).rejects.toThrow(/timed out waiting for an active order task/i);

		await vi.advanceTimersByTimeAsync(schedulerDrain.ORDER_SCHEDULER_LEASE_FOR_MS * 2 + 1_000);

		await rejected;
		expect(drain.mock.calls.length).toBeGreaterThan(10);
		expect(drain.mock.calls.length).toBeLessThan(100);
	});

	it('release interrupts a long active-task backoff and starts the next requirement without leaking its timer', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		vi.spyOn(orderTaskSeeder, 'seedTargetedOrderSchedulerTask').mockResolvedValue({
			...EMPTY_SEED_RESULT,
			skippedActive: 1,
		});
		const harness = orchestrationHarness(() => Date.now());
		const drain = vi
			.spyOn(schedulerDrain, 'runEngineSchedulerDrain')
			.mockImplementation(async () => {
				const currentWooId = drain.mock.calls.length <= 3 ? 8 : 9;
				if (currentWooId === 9) harness.setResidentOrderIds([9]);
				return currentWooId === 8 ? EMPTY_DRAIN_RESULT : { ...EMPTY_DRAIN_RESULT, succeeded: 1 };
			});

		const waiting = harness.plane.require({
			id: 'active-long-backoff',
			collection: 'orders',
			kind: 'targeted-records',
			wooIds: [8],
		});
		const next = harness.plane.require({
			id: 'after-release',
			collection: 'orders',
			kind: 'targeted-records',
			wooIds: [9],
		});
		await vi.advanceTimersByTimeAsync(300);
		expect(drain).toHaveBeenCalledTimes(3);
		expect(vi.getTimerCount()).toBe(1);

		waiting.release();
		await vi.advanceTimersByTimeAsync(0);

		await expect(waiting.ready).resolves.toMatchObject({ action: 'released' });
		await expect(next.ready).resolves.toMatchObject({ action: 'fetched', missingRecordIds: [9] });
		expect(vi.getTimerCount()).toBe(0);
	});

	it('release aborts a non-order pull promptly and frees the requirement pump', async () => {
		let firstSignal: AbortSignal | undefined;
		const engine = engineWith(async (url, init) => {
			const include = new URL(url).searchParams.get('include');
			if (include === '1') {
				firstSignal = init?.signal ?? undefined;
				return new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
						once: true,
					});
				});
			}
			return new Response(
				JSON.stringify([
					{
						id: 2,
						_rxdb_digest: 'product-digest-2',
						meta_data: [
							{ key: '_woocommerce_pos_uuid', value: '22222222-2222-4222-8222-222222222222' },
						],
						date_modified_gmt: '2026-07-10T00:00:00',
						price: '1.00',
						stock_status: 'instock',
						type: 'simple',
						categories: [],
						brands: [],
						on_sale: false,
						featured: false,
						stock_quantity: null,
					},
				]),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		});
		await engine.ready;
		const slow = engine.require({
			id: 'slow-product',
			collection: 'products',
			kind: 'targeted-records',
			wooIds: [1],
		});
		const next = engine.require({
			id: 'next-product',
			collection: 'products',
			kind: 'targeted-records',
			wooIds: [2],
		});
		await vi.waitFor(() => expect(firstSignal).toBeDefined());

		slow.release();

		await expect(slow.ready).resolves.toMatchObject({ action: 'released' });
		await expect(next.ready).resolves.toMatchObject({ action: 'fetched', missingRecordIds: [2] });
		expect(firstSignal?.aborted).toBe(true);
		await engine.dispose();
	});
});
