// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { normalizeCheckpoint, type PullResponse, type SyncCheckpoint } from '@wcpos/sync-core';

import { createOrdersSchedulerFetcher } from './rx-scheduler-order-fetcher';

import type { FetchTask } from './replication-policy';

// A deterministic, valid server-stamped uuid per Woo order id (P0-1: every pulled order
// arrives carrying its _woocommerce_pos_uuid; the emit-flip keys storage by it).
const uuidFor = (id: number) => `5b8e1a3c-2f4d-4a6b-9c8e-${String(id).padStart(12, '0')}`;

const initialCheckpoint = normalizeCheckpoint(null);

const checkpoint: SyncCheckpoint = {
	updatedAtGmt: '2026-05-20T10:00:00.000Z',
	orderId: 10,
	revision: 'rev-10',
	sequence: 10,
};

const nextCheckpoint: SyncCheckpoint = {
	updatedAtGmt: '2026-05-20T10:05:00.000Z',
	orderId: 11,
	revision: 'rev-11',
	sequence: 11,
};

function orderTask(overrides: Partial<FetchTask> = {}): FetchTask {
	return {
		id: 'orders:custom-pull:windowed',
		requirementId: 'orders.custom-pull',
		collection: 'orders',
		queryKey: 'orders:custom-pull',
		limit: 25,
		priority: 500,
		mode: 'windowed',
		...overrides,
	};
}

function response(payload: PullResponse | unknown[]): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
}

// A realistic server custom-pull record: the server streams the payload (carrying its
// stamped _woocommerce_pos_uuid) + its computed sync, and the client assembles the document
// — deriving the storage id from the payload via identifyRecord. The mock is self-consistent
// (document id == the payload's uuid), so client assembly round-trips to the same document.
function customPullDoc(wooId: number): PullResponse['documents'][number] {
	return {
		id: uuidFor(wooId),
		wooOrderId: wooId,
		payload: {
			id: wooId,
			date_modified_gmt: '2026-05-20T10:00:00',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(wooId) }],
		},
		sync: {
			revision: '',
			partial: false,
			source: 'custom-pull',
			checkpoint: normalizeCheckpoint({ orderId: wooId }),
		},
		local: { dirty: false, pendingMutationIds: [] },
	};
}

describe('createOrdersSchedulerFetcher', () => {
	it('runs one custom-pull batch for an order scheduler task and reports whether more batches remain', async () => {
		const documents = [customPullDoc(11)] as PullResponse['documents'];
		const repository = {
			upsertMany: vi.fn(async () => undefined),
		};
		const checkpointStore = {
			readCustomPullCheckpoint: vi.fn(async () => checkpoint),
			writeCustomPullCheckpoint: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () =>
			response({ documents, checkpoint: nextCheckpoint, hasMore: true })
		);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore,
			fetcher,
		});

		const result = await schedulerFetcher(orderTask());

		// F6: the custom-pull path opts into the server delete channel.
		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wc-rxdb-sync/v1/orders/pull?limit=25&updated_at_gmt=2026-05-20T10%3A00%3A00.000Z&order_id=10&sequence=10&include_deletes=true'
		);
		expect(repository.upsertMany).toHaveBeenCalledWith(documents);
		expect(checkpointStore.writeCustomPullCheckpoint).toHaveBeenCalledWith(nextCheckpoint);
		expect(result).toEqual({
			taskId: 'orders:custom-pull:windowed',
			documentCount: 1,
			requestCount: 1,
			completed: false,
		});
	});

	it('client-assembles custom-pull documents from the payload, ignoring the server-built envelope id and wooOrderId', async () => {
		// The server-built envelope identity is deliberately stale/wrong (a woo-order:<id> id AND a
		// mismatched wooOrderId); the client must re-key BOTH from the payload — the storage id from
		// the stamped uuid, wooOrderId from payload.id — so identity is owned client-side, uniform
		// with the browser/targeted paths. This is the point of the client-assemble refactor.
		const serverDoc = {
			id: 'woo-order:11',
			wooOrderId: 999,
			payload: {
				id: 11,
				date_modified_gmt: '2026-05-20T10:00:00',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(11) }],
			},
			sync: {
				revision: '',
				partial: false,
				source: 'custom-pull',
				checkpoint: normalizeCheckpoint({ orderId: 11 }),
			},
			local: { dirty: false, pendingMutationIds: [] },
		} as PullResponse['documents'][number];
		const upserted: PullResponse['documents'] = [];
		const repository = {
			upsertMany: vi.fn(async (docs: PullResponse['documents']) => {
				upserted.push(...docs);
			}),
		};
		const checkpointStore = {
			readCustomPullCheckpoint: vi.fn(async () => checkpoint),
			writeCustomPullCheckpoint: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () =>
			response({ documents: [serverDoc], checkpoint: nextCheckpoint, hasMore: false })
		);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore,
			fetcher,
		});

		await schedulerFetcher(orderTask());

		expect(upserted).toHaveLength(1);
		expect(upserted[0].id).toBe(uuidFor(11));
		expect(upserted[0].wooOrderId).toBe(11);
	});

	it('marks the custom-pull lane complete when the final greedy batch exhausts the remote orders catalog', async () => {
		const documents = [customPullDoc(11), customPullDoc(12)] as PullResponse['documents'];
		const repository = {
			upsertMany: vi.fn(async () => undefined),
		};
		const checkpointStore = {
			readCustomPullCheckpoint: vi.fn(async () => initialCheckpoint),
			writeCustomPullCheckpoint: vi.fn(async () => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
			recordCumulativeQueryResult: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () =>
			response({ documents, checkpoint: nextCheckpoint, hasMore: false })
		);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore,
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			fetcher,
		});

		await schedulerFetcher(orderTask({ mode: 'greedy' }));

		expect(coverageRepository.recordCumulativeQueryResult).toHaveBeenCalledWith({
			collection: 'orders',
			queryKey: 'orders:custom-pull',
			records: [{ id: 'woo-order:11' }, { id: 'woo-order:12' }],
			complete: true,
			nowMs: 5_000,
			freshForMs: 60_000,
			resetCumulativeExpectedIds: true,
		});
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: 'orders:custom-pull:baseline-in-progress:orders:custom-pull:windowed',
				complete: true,
			})
		);
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: 'orders:custom-pull:baseline-in-progress:orders:custom-pull:windowed',
				complete: false,
				nowMs: 5_001,
				freshForMs: 0,
			})
		);
	});

	it('does not mark a greedy terminal custom-pull batch complete when it starts from an advanced checkpoint', async () => {
		const documents = [customPullDoc(11)] as PullResponse['documents'];
		const repository = {
			upsertMany: vi.fn(async () => undefined),
		};
		const checkpointStore = {
			readCustomPullCheckpoint: vi.fn(async () => checkpoint),
			writeCustomPullCheckpoint: vi.fn(async () => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
			recordCumulativeQueryResult: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () =>
			response({ documents, checkpoint: nextCheckpoint, hasMore: false })
		);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore,
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			fetcher,
		});

		await schedulerFetcher(orderTask({ mode: 'greedy' }));

		expect(coverageRepository.recordCumulativeQueryResult).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: 'orders:custom-pull',
				complete: false,
			})
		);
	});

	it('marks a resumed greedy terminal custom-pull batch complete when a baseline marker survived fetcher restart', async () => {
		const documents = [customPullDoc(12)] as PullResponse['documents'];
		const repository = {
			upsertMany: vi.fn(async () => undefined),
		};
		const checkpointStore = {
			readCustomPullCheckpoint: vi.fn(async () => checkpoint),
			writeCustomPullCheckpoint: vi.fn(async () => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
			recordCumulativeQueryResult: vi.fn(async () => undefined),
			readLocalLaneCoverage: vi.fn(async () => ({
				collection: 'orders',
				queryKey: 'orders:custom-pull:baseline-in-progress:orders:custom-pull:windowed',
				complete: true,
				fresh: true,
				expectedRecordIds: [],
			})),
		};
		const fetcher = vi.fn(async () =>
			response({ documents, checkpoint: nextCheckpoint, hasMore: false })
		);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore,
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			fetcher,
		});

		await schedulerFetcher(orderTask({ mode: 'greedy' }));

		expect(coverageRepository.recordCumulativeQueryResult).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: 'orders:custom-pull',
				complete: true,
			})
		);
	});

	it('does not mark windowed custom-pull batches complete even when the current page is exhausted', async () => {
		const documents = [customPullDoc(11)] as PullResponse['documents'];
		const repository = {
			upsertMany: vi.fn(async () => undefined),
		};
		const checkpointStore = {
			readCustomPullCheckpoint: vi.fn(async () => checkpoint),
			writeCustomPullCheckpoint: vi.fn(async () => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
			recordCumulativeQueryResult: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () =>
			response({ documents, checkpoint: nextCheckpoint, hasMore: false })
		);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore,
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			fetcher,
		});

		await schedulerFetcher(orderTask({ mode: 'windowed' }));

		expect(coverageRepository.recordCumulativeQueryResult).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: 'orders:custom-pull',
				complete: false,
			})
		);
	});

	it('records non-final custom-pull batch records as fresh without claiming complete all-orders lane coverage', async () => {
		const documents = [customPullDoc(11), customPullDoc(12)] as PullResponse['documents'];
		const repository = {
			upsertMany: vi.fn(async () => undefined),
		};
		const checkpointStore = {
			readCustomPullCheckpoint: vi.fn(async () => checkpoint),
			writeCustomPullCheckpoint: vi.fn(async () => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
			recordRecords: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () =>
			response({ documents, checkpoint: nextCheckpoint, hasMore: true })
		);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore,
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			fetcher,
		});

		await schedulerFetcher(orderTask({ mode: 'greedy' }));

		expect(repository.upsertMany).toHaveBeenCalledWith(documents);
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith({
			collection: 'orders',
			queryKey: 'orders:custom-pull',
			records: [{ id: 'woo-order:11' }, { id: 'woo-order:12' }],
			complete: false,
			nowMs: 5_000,
			freshForMs: 60_000,
		});
	});

	it('does not advance the custom-pull checkpoint when coverage write fails after storing batch records', async () => {
		const documents = [customPullDoc(11)] as PullResponse['documents'];
		const repository = {
			upsertMany: vi.fn(async () => undefined),
		};
		const checkpointStore = {
			readCustomPullCheckpoint: vi.fn(async () => checkpoint),
			writeCustomPullCheckpoint: vi.fn(async () => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => {
				throw new Error('coverage unavailable');
			}),
		};
		const fetcher = vi.fn(async () =>
			response({ documents, checkpoint: nextCheckpoint, hasMore: false })
		);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore,
			coverageRepository,
			fetcher,
		});

		await expect(schedulerFetcher(orderTask({ mode: 'greedy' }))).rejects.toThrow(
			'coverage unavailable'
		);

		expect(repository.upsertMany).toHaveBeenCalledWith(documents);
		expect(coverageRepository.recordQueryResult).toHaveBeenCalled();
		expect(checkpointStore.writeCustomPullCheckpoint).not.toHaveBeenCalled();
	});

	it('fetches targeted order tasks through Woo REST include and stores full order documents', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () =>
			response([
				{
					id: 123,
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(123) }],
				},
				{
					id: 456,
					date_modified_gmt: '2026-05-20T10:11:00',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(456) }],
				},
			])
		);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});

		const result = await schedulerFetcher(
			orderTask({
				id: 'orders:ids:123,456:on-demand',
				requirementId: 'orders.deep-link',
				queryKey: 'orders:ids:123,456',
				ids: ['woo-order:123', 'woo-order:456'],
				wooIds: [123, 456],
				limit: 2,
				mode: 'on-demand',
			})
		);

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wc-rxdb-sync/v1/orders?include=123%2C456&per_page=2&orderby=include'
		);
		expect(repository.upsertMany).toHaveBeenCalledWith([
			{
				id: uuidFor(123),
				wooOrderId: 123,
				payload: {
					id: 123,
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(123) }],
				},
				sync: {
					revision: '2026-05-20T10:10:00',
					partial: false,
					source: 'woo-rest',
					checkpoint: {
						updatedAtGmt: '2026-05-20T10:10:00',
						orderId: 123,
						revision: '2026-05-20T10:10:00',
						sequence: 0,
					},
				},
				local: { dirty: false, pendingMutationIds: [] },
			},
			{
				id: uuidFor(456),
				wooOrderId: 456,
				payload: {
					id: 456,
					date_modified_gmt: '2026-05-20T10:11:00',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(456) }],
				},
				sync: {
					revision: '2026-05-20T10:11:00',
					partial: false,
					source: 'woo-rest',
					checkpoint: {
						updatedAtGmt: '2026-05-20T10:11:00',
						orderId: 456,
						revision: '2026-05-20T10:11:00',
						sequence: 0,
					},
				},
				local: { dirty: false, pendingMutationIds: [] },
			},
		]);
		expect(result).toEqual({
			taskId: 'orders:ids:123,456:on-demand',
			documentCount: 2,
			requestCount: 1,
			completed: true,
		});
	});

	it('reads the numeric server ids from task.wooIds, decoupled from the document-key encoding', async () => {
		// The ids here are deliberately opaque (a uuid + garbage): the document keys are
		// never parsed — wooIds is the only channel for the numeric server ids.
		const repository = { upsertMany: vi.fn(async () => undefined) };
		const fetcher = vi.fn(async () =>
			response([
				{
					id: 123,
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(123) }],
				},
				{
					id: 456,
					date_modified_gmt: '2026-05-20T10:11:00',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(456) }],
				},
			])
		);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});

		await schedulerFetcher(
			orderTask({
				id: 'orders:ids:deep-link:on-demand',
				requirementId: 'orders.deep-link',
				queryKey: 'orders:ids:deep-link',
				wooIds: [123, 456],
				ids: ['8e29c1a4-3b2d-4f6a-9c0e-1d2f3a4b5c6d', 'not-a-woo-order-key'],
				limit: 2,
				mode: 'on-demand',
			})
		);

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wc-rxdb-sync/v1/orders?include=123%2C456&per_page=2&orderby=include'
		);
	});

	it('fails a targeted order task that is missing its wooIds channel (contract error, no reverse-parse)', async () => {
		// The `/^woo-order:(\d+)$/` reverse-parse scaffolding is deleted: a targeted task
		// without wooIds is a seeder contract violation, surfaced — never silently parsed.
		const repository = { upsertMany: vi.fn(async () => undefined) };
		const fetcher = vi.fn(async () => response([]));
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});

		await expect(
			schedulerFetcher(
				orderTask({
					id: 'orders:ids:123,456:on-demand',
					requirementId: 'orders.deep-link',
					queryKey: 'orders:ids:123,456',
					ids: ['woo-order:123', 'woo-order:456'],
					limit: 2,
					mode: 'on-demand',
				})
			)
		).rejects.toThrow(
			'Targeted order scheduler task is missing its wooIds channel: orders:ids:123,456:on-demand'
		);
		expect(fetcher).not.toHaveBeenCalled();
		expect(repository.upsertMany).not.toHaveBeenCalled();
	});

	it('does NOT overwrite a targeted order that has queued local mutations, but keeps it covered', async () => {
		const repository = { upsertMany: vi.fn(async () => undefined) };
		const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
		const fetcher = vi.fn(async () =>
			response([
				{
					id: 123,
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(123) }],
				},
				{
					id: 456,
					date_modified_gmt: '2026-05-20T10:11:00',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(456) }],
				},
			])
		);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			pendingMutationOrderIds: vi.fn(async () => new Set<string | number>([123])),
			fetcher,
		});

		await schedulerFetcher(
			orderTask({
				id: 'orders:ids:123,456:on-demand',
				requirementId: 'orders.deep-link',
				queryKey: 'orders:ids:123,456',
				ids: ['woo-order:123', 'woo-order:456'],
				wooIds: [123, 456],
				limit: 2,
				mode: 'on-demand',
			})
		);

		// 123 has a queued local mutation → its dirty local copy wins (not overwritten); only 456 is upserted.
		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({ id: uuidFor(456) }),
		]);
		expect(repository.upsertMany).not.toHaveBeenCalledWith(
			expect.arrayContaining([expect.objectContaining({ id: uuidFor(123) })])
		);
		// ...but 123 stays in coverage so the window isn't reported incomplete and re-pulled.
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith(
			expect.objectContaining({
				records: expect.arrayContaining([{ id: 'woo-order:123' }, { id: 'woo-order:456' }]),
			})
		);
	});

	it('re-reads pending mutations per batch so an order queued mid-pull is not overwritten', async () => {
		const repository = { upsertMany: vi.fn(async () => undefined) };
		const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				response([
					{
						id: 123,
						date_modified_gmt: '2026-05-20T10:10:00',
						meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(123) }],
					},
				])
			)
			.mockResolvedValueOnce(
				response([
					{
						id: 456,
						date_modified_gmt: '2026-05-20T10:11:00',
						meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(456) }],
					},
				])
			);
		// Empty when batch 1 (id 123) upserts; 456 is queued by the time batch 2 upserts.
		const pendingMutationOrderIds = vi
			.fn<() => Promise<ReadonlySet<string | number>>>()
			.mockResolvedValueOnce(new Set<string | number>())
			.mockResolvedValueOnce(new Set<string | number>([456]));
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			pendingMutationOrderIds,
			fetcher,
		});

		await schedulerFetcher(
			orderTask({
				id: 'orders:ids:123,456:on-demand',
				requirementId: 'orders.deep-link',
				queryKey: 'orders:ids:123,456',
				ids: ['woo-order:123', 'woo-order:456'],
				wooIds: [123, 456],
				limit: 1, // batchSize 1 → two single-id batches, each re-reading the queue
				mode: 'on-demand',
			})
		);

		// The pending set is re-read once per batch, not snapshotted once up front.
		expect(pendingMutationOrderIds).toHaveBeenCalledTimes(2);
		// Batch 1: 456 not yet queued → 123 upserted.
		expect(repository.upsertMany).toHaveBeenNthCalledWith(1, [
			expect.objectContaining({ id: uuidFor(123) }),
		]);
		// Batch 2: 456 queued mid-pull → skipped, NOT overwritten by the stale server copy.
		expect(repository.upsertMany).toHaveBeenNthCalledWith(2, []);
	});

	it('does NOT overwrite a browser-window order that has queued local mutations (numeric pending id)', async () => {
		const repository = { upsertMany: vi.fn(async () => undefined) };
		const fetcher = vi.fn(async () =>
			response([
				{
					id: 123,
					status: 'processing',
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(123) }],
				},
				{
					id: 456,
					status: 'processing',
					date_modified_gmt: '2026-05-20T10:11:00',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(456) }],
				},
			])
		);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			pendingMutationOrderIds: vi.fn(async () => new Set<string | number>([456])),
			fetcher,
		});

		await schedulerFetcher(
			orderTask({
				id: 'orders:browser:processing:windowed',
				requirementId: 'orders.open-recent',
				queryKey: 'orders:browser:status=processing:search=:limit=50',
				limit: 50,
				mode: 'windowed',
			})
		);

		// 456 has a queued local mutation → skipped; only 123 is upserted.
		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({ id: uuidFor(123) }),
		]);
		expect(repository.upsertMany).not.toHaveBeenCalledWith(
			expect.arrayContaining([expect.objectContaining({ id: uuidFor(456) })])
		);
	});

	it('records targeted order fetch coverage after storing requested Woo REST documents', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () =>
			response([
				{
					id: 123,
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(123) }],
				},
				{
					id: 456,
					date_modified_gmt: '2026-05-20T10:11:00',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(456) }],
				},
			])
		);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});

		await schedulerFetcher(
			orderTask({
				id: 'orders:ids:123,456:on-demand',
				requirementId: 'orders.deep-link',
				queryKey: 'orders:ids:123,456',
				ids: ['woo-order:123', 'woo-order:456'],
				wooIds: [123, 456],
				limit: 2,
				mode: 'on-demand',
			})
		);

		expect(repository.upsertMany).toHaveBeenCalledOnce();
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith({
			collection: 'orders',
			queryKey: 'orders:ids:123,456',
			records: [{ id: 'woo-order:123' }, { id: 'woo-order:456' }],
			complete: true,
			nowMs: 5_000,
			freshForMs: 60_000,
		});
	});

	it('passes scheduler abort signals to Woo REST order requests', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () =>
			response([
				{
					id: 123,
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(123) }],
				},
			])
		);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});
		const abortController = new AbortController();

		await schedulerFetcher(
			orderTask({
				id: 'orders:ids:123:on-demand',
				requirementId: 'orders.deep-link',
				queryKey: 'orders:ids:123',
				ids: ['woo-order:123'],
				wooIds: [123],
				limit: 1,
				mode: 'on-demand',
			}),
			{ signal: abortController.signal }
		);

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wc-rxdb-sync/v1/orders?include=123&per_page=1&orderby=include',
			{
				signal: abortController.signal,
			}
		);
	});

	it('chunks targeted order tasks at Woo REST page-size boundaries before marking them complete', async () => {
		const requestedWooIds = Array.from({ length: 101 }, (_, index) => index + 1);
		const requestedIds = requestedWooIds.map((id) => `woo-order:${id}`);
		const firstPayloads = Array.from({ length: 100 }, (_, index) => ({
			id: index + 1,
			date_modified_gmt: `2026-05-20T10:${String(index % 60).padStart(2, '0')}:00`,
			meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(index + 1) }],
		}));
		const secondPayloads = [
			{
				id: 101,
				date_modified_gmt: '2026-05-20T11:41:00',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(101) }],
			},
		];
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(response(firstPayloads))
			.mockResolvedValueOnce(response(secondPayloads));
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});

		const result = await schedulerFetcher(
			orderTask({
				id: 'orders:ids:bulk:on-demand',
				requirementId: 'orders.bulk-deep-link',
				queryKey: 'orders:ids:bulk',
				ids: requestedIds,
				wooIds: requestedWooIds,
				limit: 101,
				mode: 'on-demand',
			})
		);

		expect(fetcher).toHaveBeenCalledTimes(2);
		const firstUrl = String(fetcher.mock.calls[0]?.[0] ?? '');
		expect(firstUrl).toContain(
			`include=${Array.from({ length: 100 }, (_, index) => index + 1).join('%2C')}`
		);
		expect(firstUrl).toContain('per_page=100');
		expect(fetcher.mock.calls[1][0]).toBe(
			'http://wcpos.local/wp-json/wc-rxdb-sync/v1/orders?include=101&per_page=1&orderby=include'
		);
		expect(repository.upsertMany).toHaveBeenCalledTimes(2);
		expect(repository.upsertMany.mock.calls[0][0]).toHaveLength(100);
		expect(repository.upsertMany.mock.calls[1][0]).toHaveLength(1);
		expect(result).toEqual({
			taskId: 'orders:ids:bulk:on-demand',
			documentCount: 101,
			requestCount: 2,
			completed: true,
		});
	});

	it('honors the targeted task limit when it is smaller than the Woo REST page-size cap', async () => {
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				response([
					{
						id: 1,
						date_modified_gmt: '2026-05-20T10:01:00',
						meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(1) }],
					},
					{
						id: 2,
						date_modified_gmt: '2026-05-20T10:02:00',
						meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(2) }],
					},
				])
			)
			.mockResolvedValueOnce(
				response([
					{
						id: 3,
						date_modified_gmt: '2026-05-20T10:03:00',
						meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(3) }],
					},
					{
						id: 4,
						date_modified_gmt: '2026-05-20T10:04:00',
						meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(4) }],
					},
				])
			)
			.mockResolvedValueOnce(
				response([
					{
						id: 5,
						date_modified_gmt: '2026-05-20T10:05:00',
						meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(5) }],
					},
				])
			);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});

		const result = await schedulerFetcher(
			orderTask({
				id: 'orders:ids:limit-two:on-demand',
				requirementId: 'orders.limit-two',
				queryKey: 'orders:ids:limit-two',
				ids: ['woo-order:1', 'woo-order:2', 'woo-order:3', 'woo-order:4', 'woo-order:5'],
				wooIds: [1, 2, 3, 4, 5],
				limit: 2,
				mode: 'on-demand',
			})
		);

		expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
			'http://wcpos.local/wp-json/wc-rxdb-sync/v1/orders?include=1%2C2&per_page=2&orderby=include',
			'http://wcpos.local/wp-json/wc-rxdb-sync/v1/orders?include=3%2C4&per_page=2&orderby=include',
			'http://wcpos.local/wp-json/wc-rxdb-sync/v1/orders?include=5&per_page=1&orderby=include',
		]);
		expect(result).toEqual({
			taskId: 'orders:ids:limit-two:on-demand',
			documentCount: 5,
			requestCount: 3,
			completed: true,
		});
	});

	it('fails targeted order tasks when Woo omits a requested order id', async () => {
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const fetcher = vi.fn(async () =>
			response([
				{
					id: 123,
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(123) }],
				},
			])
		);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});

		await expect(
			schedulerFetcher(
				orderTask({
					id: 'orders:ids:missing:on-demand',
					requirementId: 'orders.missing',
					queryKey: 'orders:ids:missing',
					ids: ['woo-order:123', 'woo-order:456'],
					wooIds: [123, 456],
					limit: 2,
					mode: 'on-demand',
				})
			)
		).rejects.toThrow('Woo REST targeted order response missing requested order ids: 456');
		expect(repository.upsertMany).not.toHaveBeenCalled();
	});

	it('fetches status-only browser order query tasks through Woo REST filter descriptors', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () =>
			response([
				{
					id: 789,
					status: 'processing',
					date_modified_gmt: '2026-05-20T10:12:00',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(789) }],
				},
			])
		);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});

		const result = await schedulerFetcher(
			orderTask({
				id: 'orders:browser:processing:windowed',
				requirementId: 'orders.browser.processing',
				queryKey: 'orders:browser:status=processing:search=:limit=50',
				limit: 25,
				mode: 'windowed',
			})
		);

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wc-rxdb-sync/v1/orders?status=processing&per_page=25&page=1&orderby=id&order=desc'
		);
		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({
				id: uuidFor(789),
				wooOrderId: 789,
				payload: {
					id: 789,
					status: 'processing',
					date_modified_gmt: '2026-05-20T10:12:00',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(789) }],
				},
				sync: expect.objectContaining({ source: 'woo-rest', partial: false }),
				local: { dirty: false, pendingMutationIds: [] },
			}),
		]);
		expect(result).toEqual({
			taskId: 'orders:browser:processing:windowed',
			documentCount: 1,
			requestCount: 1,
			completed: true,
		});
	});

	it('records capped browser order query coverage as incomplete without exhaustion evidence', async () => {
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
		};
		const page = Array.from({ length: 50 }, (_, index) => ({
			id: 1_000 - index,
			status: 'processing',
			date_modified_gmt: '2026-05-20T10:12:00',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(1_000 - index) }],
		}));
		const fetcher = vi.fn().mockResolvedValueOnce(response(page));
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			coverageRepository,
			coverageFreshForMs: 120_000,
			nowMs: () => 7_500,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});

		await schedulerFetcher(
			orderTask({
				id: 'orders:browser:processing:windowed',
				requirementId: 'orders.browser.processing',
				queryKey: 'orders:browser:status=processing:search=:limit=50',
				limit: 50,
				mode: 'windowed',
			})
		);

		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: 'orders:browser:status=processing:search=:limit=50',
				complete: false,
			})
		);
	});

	it('records partially sliced browser order pages as incomplete when Woo returns rows beyond the descriptor limit', async () => {
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
		};
		const firstPage = Array.from({ length: 100 }, (_, index) => ({
			id: 1_000 - index,
			status: 'processing',
			date_modified_gmt: '2026-05-20T10:12:00',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(1_000 - index) }],
		}));
		const secondPage = Array.from({ length: 75 }, (_, index) => ({
			id: 900 - index,
			status: 'processing',
			date_modified_gmt: '2026-05-20T10:13:00',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(900 - index) }],
		}));
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(response(firstPage))
			.mockResolvedValueOnce(response(secondPage));
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			coverageRepository,
			coverageFreshForMs: 120_000,
			nowMs: () => 7_500,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});

		const result = await schedulerFetcher(
			orderTask({
				id: 'orders:browser:processing-large:windowed',
				requirementId: 'orders.browser.processing.large',
				queryKey: 'orders:browser:status=processing:search=:limit=150',
				limit: 150,
				mode: 'windowed',
			})
		);

		expect(result).toEqual({
			taskId: 'orders:browser:processing-large:windowed',
			documentCount: 150,
			requestCount: 2,
			completed: true,
		});
		expect(repository.upsertMany).toHaveBeenCalledTimes(2);
		expect(repository.upsertMany.mock.calls[1][0]).toHaveLength(50);
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: 'orders:browser:status=processing:search=:limit=150',
				records: expect.arrayContaining([{ id: 'woo-order:900' }, { id: 'woo-order:851' }]),
				complete: false,
			})
		);
	});

	it('records browser order query coverage across fetched Woo REST pages', async () => {
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
		};
		const firstPage = Array.from({ length: 100 }, (_, index) => ({
			id: 1_000 - index,
			status: 'processing',
			date_modified_gmt: '2026-05-20T10:12:00',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(1_000 - index) }],
		}));
		const secondPage = Array.from({ length: 2 }, (_, index) => ({
			id: 900 - index,
			status: 'processing',
			date_modified_gmt: '2026-05-20T10:13:00',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(900 - index) }],
		}));
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(response(firstPage))
			.mockResolvedValueOnce(response(secondPage));
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			coverageRepository,
			coverageFreshForMs: 120_000,
			nowMs: () => 7_500,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});

		await schedulerFetcher(
			orderTask({
				id: 'orders:browser:processing-large:windowed',
				requirementId: 'orders.browser.processing.large',
				queryKey: 'orders:browser:status=processing:search=:limit=102',
				limit: 102,
				mode: 'windowed',
			})
		);

		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith({
			collection: 'orders',
			queryKey: 'orders:browser:status=processing:search=:limit=102',
			records: [
				...firstPage.map((payload) => ({ id: `woo-order:${payload.id}` })),
				...secondPage.map((payload) => ({ id: `woo-order:${payload.id}` })),
			],
			complete: true,
			nowMs: 7_500,
			freshForMs: 120_000,
		});
	});

	it('fetches bounded multi-page status-only browser order query descriptors', async () => {
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const firstPage = Array.from({ length: 100 }, (_, index) => ({
			id: 1_000 - index,
			status: 'processing',
			date_modified_gmt: '2026-05-20T10:12:00',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(1_000 - index) }],
		}));
		const secondPage = Array.from({ length: 50 }, (_, index) => ({
			id: 900 - index,
			status: 'processing',
			date_modified_gmt: '2026-05-20T10:13:00',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(900 - index) }],
		}));
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(response(firstPage))
			.mockResolvedValueOnce(response(secondPage));
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});

		const result = await schedulerFetcher(
			orderTask({
				id: 'orders:browser:processing-large:windowed',
				requirementId: 'orders.browser.processing.large',
				queryKey: 'orders:browser:status=processing:search=:limit=150',
				limit: 150,
				mode: 'windowed',
			})
		);

		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(fetcher).toHaveBeenNthCalledWith(
			1,
			'http://wcpos.local/wp-json/wc-rxdb-sync/v1/orders?status=processing&per_page=100&page=1&orderby=id&order=desc'
		);
		expect(fetcher).toHaveBeenNthCalledWith(
			2,
			'http://wcpos.local/wp-json/wc-rxdb-sync/v1/orders?status=processing&per_page=100&page=2&orderby=id&order=desc'
		);
		expect(repository.upsertMany).toHaveBeenCalledTimes(2);
		expect(result).toEqual({
			taskId: 'orders:browser:processing-large:windowed',
			documentCount: 150,
			requestCount: 2,
			completed: true,
		});
	});

	it('fetches browser order search descriptors through Woo REST search requests', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
			recordRecords: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () =>
			response([
				{
					id: 789,
					status: 'processing',
					date_modified_gmt: '2026-05-20T10:12:00',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(789) }],
				},
			])
		);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			coverageRepository,
			coverageFreshForMs: 120_000,
			nowMs: () => 7_500,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});

		const result = await schedulerFetcher(
			orderTask({
				id: 'orders:browser:search:windowed',
				requirementId: 'orders.browser.search',
				queryKey: 'orders:browser:status=processing:search=hat:limit=50',
				limit: 50,
				mode: 'windowed',
			})
		);

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wc-rxdb-sync/v1/orders?status=processing&search=hat&per_page=50&page=1&orderby=id&order=desc'
		);
		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({
				id: uuidFor(789),
				wooOrderId: 789,
				payload: {
					id: 789,
					status: 'processing',
					date_modified_gmt: '2026-05-20T10:12:00',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(789) }],
				},
			}),
		]);
		expect(coverageRepository.recordRecords).toHaveBeenCalledWith({
			collection: 'orders',
			queryKey: 'orders:browser:status=processing:search=hat:limit=50',
			records: [{ id: 'woo-order:789' }],
			nowMs: 7_500,
			freshForMs: 120_000,
		});
		expect(coverageRepository.recordQueryResult).not.toHaveBeenCalled();
		expect(result).toEqual({
			taskId: 'orders:browser:search:windowed',
			documentCount: 1,
			requestCount: 1,
			completed: true,
		});
	});

	it('does not downgrade search lanes when record-only coverage recording is unavailable', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () =>
			response([
				{
					id: 789,
					status: 'processing',
					date_modified_gmt: '2026-05-20T10:12:00',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(789) }],
				},
			])
		);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			coverageRepository,
			coverageFreshForMs: 120_000,
			nowMs: () => 7_500,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});

		await schedulerFetcher(
			orderTask({
				id: 'orders:browser:search:windowed',
				requirementId: 'orders.browser.search',
				queryKey: 'orders:browser:status=processing:search=hat:limit=50',
				limit: 50,
				mode: 'windowed',
			})
		);

		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({
				id: uuidFor(789),
			}),
		]);
		expect(coverageRepository.recordQueryResult).not.toHaveBeenCalled();
	});

	it('rejects browser order query descriptors for non-order collections', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () => response([]));
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});

		await expect(
			schedulerFetcher(
				orderTask({
					collection: 'products',
					queryKey: 'orders:browser:status=processing:search=:limit=50',
				})
			)
		).rejects.toThrow('Orders scheduler fetcher cannot run products tasks');
		expect(fetcher).not.toHaveBeenCalled();
		expect(repository.upsertMany).not.toHaveBeenCalled();
	});

	it('fails a greedy custom-pull task when hasMore stays true without checkpoint progress', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
		};
		const checkpointStore = {
			readCustomPullCheckpoint: vi.fn(async () => checkpoint),
			writeCustomPullCheckpoint: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () => response({ documents: [], checkpoint, hasMore: true }));
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			checkpointStore,
			fetcher,
		});

		await schedulerFetcher(orderTask({ mode: 'greedy' }));
		await schedulerFetcher(orderTask({ mode: 'greedy' }));
		await expect(schedulerFetcher(orderTask({ mode: 'greedy' }))).rejects.toThrow(
			'Custom pull stalled: checkpoint did not advance while hasMore=true'
		);
	});
});
