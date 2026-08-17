// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
	normalizeCheckpoint,
	type OrderDocument,
	type PullResponse,
	type SyncCheckpoint,
	type WirePullDocument,
	wooIdOf,
} from '@wcpos/sync-core';

import { remoteId } from '../testing';
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

function response(payload: PullResponse<WirePullDocument> | unknown[]): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
}

// A realistic server custom-pull record: the server streams the payload (carrying its
// stamped _woocommerce_pos_uuid) + its computed sync, and the client assembles the document
// — deriving the storage id from the payload via identifyRecord. The mock is self-consistent
// (document id == the payload's uuid), so client assembly round-trips to the same document.
function customPullDoc(wooId: number): WirePullDocument {
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
		const documents = [customPullDoc(11)];
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			checkpointStore,
			fetcher,
		});

		const result = await schedulerFetcher(orderTask());

		// F6: the custom-pull path opts into the server delete channel.
		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wcpos/v2/orders/pull?limit=25&updated_at_gmt=2026-05-20T10%3A00%3A00.000Z&order_id=10&sequence=10&include_deletes=true'
		);
		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({ uuid: uuidFor(11), remoteId: '11' }),
		]);
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
		} as WirePullDocument;
		const upserted: OrderDocument[] = [];
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			checkpointStore,
			fetcher,
		});

		await schedulerFetcher(orderTask());

		expect(upserted).toHaveLength(1);
		expect(upserted[0].uuid).toBe(uuidFor(11));
		expect(upserted[0].remoteId).toBe('11');
	});

	it.each([
		['uuid', uuidFor(11)],
		['remote id', remoteId(11)],
		['numeric Woo id', 11],
	])('guards stale-envelope custom-pull documents by assembled %s', async (_label, pendingId) => {
		const serverDoc = {
			...customPullDoc(11),
			id: 'woo-order:stale',
			wooOrderId: 999,
		};
		const repository = {
			upsertMany: vi.fn(async () => undefined),
		};
		const checkpointStore = {
			readCustomPullCheckpoint: vi.fn(async () => checkpoint),
			writeCustomPullCheckpoint: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () =>
			response({ documents: [serverDoc], checkpoint: nextCheckpoint, hasMore: false })
		);
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			checkpointStore,
			pendingMutationOrderIds: vi.fn(async () => new Set<string | number>([pendingId])),
			fetcher,
		});

		await schedulerFetcher(orderTask());

		expect(repository.upsertMany).toHaveBeenCalledWith([]);
	});

	it('marks the custom-pull lane complete when the final greedy batch exhausts the remote orders catalog', async () => {
		const documents = [customPullDoc(11), customPullDoc(12)] as WirePullDocument[];
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
		const documents = [customPullDoc(11)] as WirePullDocument[];
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
		const documents = [customPullDoc(12)] as WirePullDocument[];
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
		const documents = [customPullDoc(11)] as WirePullDocument[];
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
		const documents = [customPullDoc(11), customPullDoc(12)] as WirePullDocument[];
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			checkpointStore,
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			fetcher,
		});

		await schedulerFetcher(orderTask({ mode: 'greedy' }));

		expect(repository.upsertMany).toHaveBeenCalledWith(
			documents.map((document) =>
				expect.objectContaining({
					uuid: uuidFor(Number(document.payload.id)),
					remoteId: remoteId(Number(document.payload.id)),
				})
			)
		);
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
		const documents = [customPullDoc(11)] as WirePullDocument[];
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			checkpointStore,
			coverageRepository,
			fetcher,
		});

		await expect(schedulerFetcher(orderTask({ mode: 'greedy' }))).rejects.toThrow(
			'coverage unavailable'
		);

		expect(repository.upsertMany).toHaveBeenCalledWith(
			documents.map((document) =>
				expect.objectContaining({
					uuid: uuidFor(Number(document.payload.id)),
					remoteId: remoteId(Number(document.payload.id)),
				})
			)
		);
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
				remoteIds: [123, 456].map(remoteId),
				limit: 2,
				mode: 'on-demand',
			})
		);

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wcpos/v2/orders?include=123%2C456&per_page=2&orderby=include'
		);
		expect(repository.upsertMany).toHaveBeenCalledWith([
			{
				uuid: uuidFor(123),
				remoteId: remoteId(123),
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
				uuid: uuidFor(456),
				remoteId: remoteId(456),
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

	it('reads the numeric server ids from task.remoteIds, decoupled from the document-key encoding', async () => {
		// The ids here are deliberately opaque (a uuid + garbage): the document keys are
		// never parsed — remoteIds is the only channel for the numeric server ids.
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
				remoteIds: [123, 456].map(remoteId),
				ids: ['8e29c1a4-3b2d-4f6a-9c0e-1d2f3a4b5c6d', 'not-a-woo-order-key'],
				limit: 2,
				mode: 'on-demand',
			})
		);

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wcpos/v2/orders?include=123%2C456&per_page=2&orderby=include'
		);
	});

	it('fails a targeted order task that is missing its remoteIds channel (contract error, no reverse-parse)', async () => {
		// The `/^woo-order:(\d+)$/` reverse-parse scaffolding is deleted: a targeted task
		// without remoteIds is a seeder contract violation, surfaced — never silently parsed.
		const repository = { upsertMany: vi.fn(async () => undefined) };
		const fetcher = vi.fn(async () => response([]));
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
			'Targeted order scheduler task is missing its remoteIds channel: orders:ids:123,456:on-demand'
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
				remoteIds: [123, 456].map(remoteId),
				limit: 2,
				mode: 'on-demand',
			})
		);

		// 123 has a queued local mutation → its dirty local copy wins (not overwritten); only 456 is upserted.
		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({ uuid: uuidFor(456) }),
		]);
		expect(repository.upsertMany).not.toHaveBeenCalledWith(
			expect.arrayContaining([expect.objectContaining({ uuid: uuidFor(123) })])
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
				remoteIds: [123, 456].map(remoteId),
				limit: 1, // batchSize 1 → two single-id batches, each re-reading the queue
				mode: 'on-demand',
			})
		);

		// The pending set is re-read once per batch, not snapshotted once up front.
		expect(pendingMutationOrderIds).toHaveBeenCalledTimes(2);
		// Batch 1: 456 not yet queued → 123 upserted.
		expect(repository.upsertMany).toHaveBeenNthCalledWith(1, [
			expect.objectContaining({ uuid: uuidFor(123) }),
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
			expect.objectContaining({ uuid: uuidFor(123) }),
		]);
		expect(repository.upsertMany).not.toHaveBeenCalledWith(
			expect.arrayContaining([expect.objectContaining({ uuid: uuidFor(456) })])
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
				remoteIds: [123, 456].map(remoteId),
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
				remoteIds: [123].map(remoteId),
				limit: 1,
				mode: 'on-demand',
			}),
			{ signal: abortController.signal }
		);

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wcpos/v2/orders?include=123&per_page=1&orderby=include',
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
				remoteIds: requestedWooIds.map(remoteId),
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
			'http://wcpos.local/wp-json/wcpos/v2/orders?include=101&per_page=1&orderby=include'
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
				remoteIds: [1, 2, 3, 4, 5].map(remoteId),
				limit: 2,
				mode: 'on-demand',
			})
		);

		expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
			'http://wcpos.local/wp-json/wcpos/v2/orders?include=1%2C2&per_page=2&orderby=include',
			'http://wcpos.local/wp-json/wcpos/v2/orders?include=3%2C4&per_page=2&orderby=include',
			'http://wcpos.local/wp-json/wcpos/v2/orders?include=5&per_page=1&orderby=include',
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
					remoteIds: [123, 456].map(remoteId),
					limit: 2,
					mode: 'on-demand',
				})
			)
		).rejects.toThrow('Woo REST targeted order response missing requested order ids: 456');
		expect(repository.upsertMany).not.toHaveBeenCalled();
	});

	it('fetches customer browser order query tasks through Woo REST filter descriptors', async () => {
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
				queryKey: 'orders:browser:status=processing:customer=42:search=:limit=50',
				limit: 25,
				mode: 'windowed',
			})
		);

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wcpos/v2/orders?status=processing&customer=42&per_page=25&page=1&orderby=id&order=desc'
		);
		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({
				uuid: uuidFor(789),
				remoteId: remoteId(789),
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

	it('sends cashier, store, and sort dimensions through Woo REST browser requests', async () => {
		const repository = { upsertMany: vi.fn(async () => undefined) };
		const fetcher = vi.fn(async (_url: string) => response([]));
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});

		for (const queryKey of [
			'orders:browser:status=processing:cashier=7:store=12:orderby=date:order=asc:search=:limit=25',
			'orders:browser:status=all:store=woocommerce-pos:search=:limit=25',
		]) {
			await schedulerFetcher(orderTask({ id: `${queryKey}:windowed`, queryKey }));
		}

		expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
			'http://wcpos.local/wp-json/wcpos/v2/orders?status=processing&pos_cashier=7&pos_store=12&per_page=25&page=1&orderby=date&order=asc',
			'http://wcpos.local/wp-json/wcpos/v2/orders?created_via=woocommerce-pos&per_page=25&page=1&orderby=id&order=desc',
		]);
	});

	// `pos_cashier`/`pos_store` are WCPOS proxy params, not wc/v3 core params: a store on an
	// older plugin ignores them and answers with the unfiltered superset. That superset must
	// not be recorded as a complete lane, or the grid's projected total (the lane's record
	// count, un-narrowed) reports every cashier's orders as the filtered total.
	it('withholds lane completion when the server ignored the POS dimensions', async () => {
		const orderPayload = (wooId: number, cashier: string) => ({
			id: wooId,
			status: 'processing',
			date_modified_gmt: '2026-05-20T10:12:00',
			meta_data: [
				{ key: '_woocommerce_pos_uuid', value: uuidFor(wooId) },
				{ key: '_pos_user', value: cashier },
			],
		});
		const runWith = async (cashiers: string[]) => {
			const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
			const schedulerFetcher = createOrdersSchedulerFetcher({
				baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
				repository: { upsertMany: vi.fn(async () => undefined) },
				coverageRepository,
				checkpointStore: {
					readCustomPullCheckpoint: vi.fn(async () => checkpoint),
					writeCustomPullCheckpoint: vi.fn(async () => undefined),
				},
				fetcher: vi.fn(async () =>
					response(cashiers.map((cashier, index) => orderPayload(900 + index, cashier)))
				),
			});
			const queryKey = 'orders:browser:status=processing:cashier=7:search=:limit=25';
			await schedulerFetcher(orderTask({ id: `${queryKey}:windowed`, queryKey }));
			return coverageRepository.recordQueryResult;
		};

		// Current plugin: every record carries the requested cashier — lane completes.
		expect(await runWith(['7', '7'])).toHaveBeenLastCalledWith(
			expect.objectContaining({ complete: true })
		);
		// Old plugin: the param was ignored, so another cashier's order came back too.
		expect(await runWith(['7', '9'])).toHaveBeenLastCalledWith(
			expect.objectContaining({ complete: false })
		);
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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

	// -------------------------------------------------------------------------
	// #957 — windows page indefinitely, and grow by their DELTA
	// -------------------------------------------------------------------------

	const orderPage = (from: number, count: number) =>
		Array.from({ length: count }, (_, index) => ({
			id: from - index,
			status: 'processing',
			date_modified_gmt: '2026-05-20T10:12:00',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(from - index) }],
		}));

	function coverageWithLanes(lanes: Record<string, { complete: boolean; ids: string[] }>) {
		return {
			recordQueryResult: vi.fn(async () => undefined),
			readLocalLaneCoverage: vi.fn(async (_collection: string, queryKey: string) => {
				const lane = lanes[queryKey];
				return lane ? { complete: lane.complete, fresh: true, expectedRecordIds: lane.ids } : null;
			}),
		};
	}

	/**
	 * #957 — the ruling, pinned at the wire.
	 *
	 * `extendLimit` from 200 to 300 used to be a no-op: the encoder clamped both to
	 * `:limit=200`, the scheduler saw a key it had already run, and the grid dead-ended.
	 * Now 300 is its own descriptor — and the fetch is the DELTA: page 3, one hundred
	 * orders, not a re-download of the first two hundred.
	 */
	it('extends 200 → 300 as a new lane and fetches only the uncovered delta', async () => {
		const repository = { upsertMany: vi.fn(async (_documents: unknown) => undefined) };
		const coverageRepository = coverageWithLanes({
			'orders:browser:status=processing:search=:limit=200': {
				complete: false,
				ids: Array.from({ length: 200 }, (_, index) => `woo-order:${1_000 - index}`),
			},
		});
		const pagesSeen: number[] = [];
		const fetcher = vi.fn(async (request: RequestInfo | URL) => {
			const params = new URL(String(request)).searchParams;
			const page = Number(params.get('page'));
			pagesSeen.push(page);
			return response(orderPage(1_000 - (page - 1) * 100, 100));
		});
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
				id: 'orders:browser:processing-300:windowed',
				requirementId: 'orders.browser.processing.300',
				queryKey: 'orders:browser:status=processing:search=:limit=300',
				limit: 300,
				mode: 'windowed',
			})
		);

		// A REQUEST IS ISSUED (the dedupe collapse is gone) and it is page 3 — the delta.
		expect(pagesSeen).toEqual([3]);
		expect(result).toMatchObject({ documentCount: 100, requestCount: 1, completed: true });
		// The lane describes the whole 300-row window: prefix ∪ delta.
		const [recorded] = coverageRepository.recordQueryResult.mock.calls[0] as unknown as [
			{ queryKey: string; records: { id: string }[] },
		];
		expect(recorded.queryKey).toBe('orders:browser:status=processing:search=:limit=300');
		expect(recorded.records).toHaveLength(300);
		expect(recorded.records[0]).toEqual({ id: 'woo-order:1000' });
		expect(recorded.records[299]).toEqual({ id: 'woo-order:701' });
	});

	// #957 — the cap applied to every dimension equally, so the fix must too.
	it('extends a customer-scoped window past 200 and continues from its own lane', async () => {
		const repository = { upsertMany: vi.fn(async (_documents: unknown) => undefined) };
		const coverageRepository = coverageWithLanes({
			'orders:browser:status=all:customer=42:search=:limit=200': {
				complete: false,
				ids: Array.from({ length: 200 }, (_, index) => `woo-order:${1_000 - index}`),
			},
		});
		const urlsSeen: string[] = [];
		const fetcher = vi.fn(async (request: RequestInfo | URL) => {
			urlsSeen.push(String(request));
			const page = Number(new URL(String(request)).searchParams.get('page'));
			return response(orderPage(1_000 - (page - 1) * 100, 100));
		});
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			nowMs: () => 7_500,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});

		await schedulerFetcher(
			orderTask({
				id: 'orders:browser:customer-42-300:windowed',
				queryKey: 'orders:browser:status=all:customer=42:search=:limit=300',
				limit: 300,
				mode: 'windowed',
			})
		);

		expect(urlsSeen).toHaveLength(1);
		expect(urlsSeen[0]).toContain('customer=42');
		expect(urlsSeen[0]).toContain('page=3');
	});

	// #957 — a fresh lane already holding the whole window costs nothing.
	it('serves a fresh, filled orders window from coverage without touching the wire', async () => {
		const repository = { upsertMany: vi.fn(async (_documents: unknown) => undefined) };
		const coverageRepository = coverageWithLanes({
			'orders:browser:status=processing:search=:limit=300': {
				complete: false,
				ids: Array.from({ length: 300 }, (_, index) => `woo-order:${1_000 - index}`),
			},
		});
		const fetcher = vi.fn(async () => response([]));
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});

		const result = await schedulerFetcher(
			orderTask({
				id: 'orders:browser:processing-300:windowed',
				queryKey: 'orders:browser:status=processing:search=:limit=300',
				limit: 300,
				mode: 'windowed',
			})
		);

		expect(fetcher).not.toHaveBeenCalled();
		expect(coverageRepository.recordQueryResult).not.toHaveBeenCalled();
		expect(result).toMatchObject({ documentCount: 0, requestCount: 0 });
	});

	/**
	 * REGRESSION — order churn between two growth steps (#957 review finding, HIGH).
	 *
	 * The lane holds 200 ids. One order is created, so every later record shifts down a wire
	 * slot and the resume page re-delivers one row the prefix already has. The merge dedupes
	 * it and the lane comes back with 299 ids for a 300-row window.
	 *
	 * The bug this pins: 299 was then treated as a wire offset on the next pass
	 * (299 % 100 = 99, so it skipped 99 rows of page 4) and ~99 orders were never fetched at
	 * all — the window froze with a hole in it. The lane must report INCOMPLETE, and the
	 * ragged count must never become an offset.
	 */
	it('does not punch a hole in the window when an order is created between growth steps', async () => {
		const repository = { upsertMany: vi.fn(async (_documents: unknown) => undefined) };
		const coverageRepository = coverageWithLanes({
			'orders:browser:status=processing:search=:limit=200': {
				complete: false,
				ids: Array.from({ length: 200 }, (_, index) => `woo-order:${1_000 - index}`),
			},
		});
		// The server list has shifted by one: O_new sits above the 200 already covered, so
		// wire positions 201..300 are O800..O701 shifted, re-delivering woo-order:801.
		const fetcher = vi.fn(async (request: RequestInfo | URL) => {
			const page = Number(new URL(String(request)).searchParams.get('page'));
			const top = 1_001 - (page - 1) * 100;
			return response(orderPage(top, 100));
		});
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			nowMs: () => 7_500,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher,
		});

		await schedulerFetcher(
			orderTask({
				id: 'orders:browser:processing-300:windowed',
				queryKey: 'orders:browser:status=processing:search=:limit=300',
				limit: 300,
				mode: 'windowed',
			})
		);

		const [recorded] = coverageRepository.recordQueryResult.mock.calls[0] as unknown as [
			{ records: { id: string }[]; complete: boolean },
		];
		// The seam duplicate is deduped, so the window is short of 300 …
		expect(recorded.records.length).toBeLessThan(300);
		// … and it must therefore be INCOMPLETE, which routes the next pass to a full
		// re-walk instead of offsetting from a count that no longer maps to a wire position.
		expect(recorded.complete).toBe(false);
		// No duplicate ids survived into the lane.
		expect(new Set(recorded.records.map(({ id }) => id)).size).toBe(recorded.records.length);
	});

	/**
	 * #948/#957 follow-up — Paul's eviction ruling, on the lane family that bloats fastest.
	 *
	 * Orders windows travel VERBATIM below one Woo page, so a cashier who scrolls the first
	 * hundred rows mints a lane per ten: 10, 20, 30 … 100. Ten lanes and 550 stored ids to
	 * describe a hundred orders. When the 100-row window completes, the nine windows it
	 * strictly contains go with it.
	 */
	it('evicts the sub-quantum windows a completed orders window contains', async () => {
		const repository = { upsertMany: vi.fn(async (_documents: unknown) => undefined) };
		const wooOrderIds = (count: number) =>
			Array.from({ length: count }, (_, index) => `woo-order:${1_000 - index}`);
		const lanes = new Map<
			string,
			{ complete: boolean; expectedRecordIds: string[]; updatedAtMs: number }
		>();
		for (const limit of [10, 20, 30, 40, 50, 60, 70, 80, 90]) {
			lanes.set(`orders:browser:status=processing:search=:limit=${limit}`, {
				complete: true,
				expectedRecordIds: wooOrderIds(limit),
				// Written by earlier scroll ticks, i.e. before the 100-row window settles.
				updatedAtMs: 7_000 + limit,
			});
		}
		const coverageRepository = {
			recordQueryResult: vi.fn(
				async (input: {
					queryKey: string;
					records: { id: string }[];
					complete: boolean;
					nowMs: number;
				}) => {
					lanes.set(input.queryKey, {
						complete: input.complete,
						expectedRecordIds: input.records.map((record) => record.id),
						updatedAtMs: input.nowMs,
					});
				}
			),
			readLocalLaneCoverage: vi.fn(async (_collection: string, queryKey: string) => {
				const lane = lanes.get(queryKey);
				return lane
					? { complete: lane.complete, fresh: true, expectedRecordIds: [...lane.expectedRecordIds] }
					: null;
			}),
			listCoverageLanes: vi.fn(async () =>
				[...lanes.entries()].map(([queryKey, lane]) => ({ queryKey, ...lane }))
			),
			removeCoverageLaneIfContained: vi.fn(
				async (input: {
					queryKey: string;
					containedIn: readonly string[];
					supersededAtMs: number;
				}) => {
					const lane = lanes.get(input.queryKey);
					if (!lane || lane.updatedAtMs > input.supersededAtMs) return false;
					const containedIn = new Set(input.containedIn);
					if (!lane.expectedRecordIds.every((id) => containedIn.has(id))) return false;
					lanes.delete(input.queryKey);
					return true;
				}
			),
		};
		// A busy store: the server does NOT run out, so this lane is recorded `complete: false`
		// like every deep orders window. It is settled because it FILLED — the property that
		// makes eviction fire on the orders family at all (see isSettledBrowseWindowLane).
		const fetcher = vi.fn(async () => response(orderPage(1_000, 100)));
		const schedulerFetcher = createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
				id: 'orders:browser:processing-100:windowed',
				queryKey: 'orders:browser:status=processing:search=:limit=100',
				limit: 100,
				mode: 'windowed',
			})
		);

		expect([...lanes.keys()]).toEqual(['orders:browser:status=processing:search=:limit=100']);
		// The footer reads expectedRecordIds.length for exactly this key — still the window.
		expect(
			lanes.get('orders:browser:status=processing:search=:limit=100')!.expectedRecordIds
		).toHaveLength(100);
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
			'http://wcpos.local/wp-json/wcpos/v2/orders?status=processing&per_page=100&page=1&orderby=id&order=desc'
		);
		expect(fetcher).toHaveBeenNthCalledWith(
			2,
			'http://wcpos.local/wp-json/wcpos/v2/orders?status=processing&per_page=100&page=2&orderby=id&order=desc'
		);
		expect(repository.upsertMany).toHaveBeenCalledTimes(2);
		expect(result).toEqual({
			taskId: 'orders:browser:processing-large:windowed',
			documentCount: 150,
			requestCount: 2,
			completed: true,
		});
	});

	// ── ranged fetch-to-completion: #941's completion detection + #954's resumable cursor ──

	/** An arbitrary UTC instant inside the ranges these tests declare. */
	const RANGE_BASE_SECONDS = 1_783_000_000;
	const RANGE_QUERY_KEY =
		'orders:browser:status=completed:after=1782864000:before=1784073599:search=:limit=all';
	const gmtSeconds = (epochSeconds: number) =>
		new Date(epochSeconds * 1_000).toISOString().slice(0, 19);
	const beforeParam = (epochSeconds: number) =>
		encodeURIComponent(new Date(epochSeconds * 1_000).toISOString());
	const rangedOrder = (wooId: number, epochSeconds: number) => ({
		id: wooId,
		date_created_gmt: gmtSeconds(epochSeconds),
		date_modified_gmt: gmtSeconds(epochSeconds),
		meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(wooId) }],
	});
	const rangedResponse = (payload: unknown[], headers: Record<string, string> = {}) =>
		new Response(JSON.stringify(payload), {
			status: 200,
			headers: { 'content-type': 'application/json', ...headers },
		});

	/**
	 * A Woo `/orders` stand-in that honours exactly the params the ranged walk cursors on —
	 * `after`/`before` (exclusive, `dates_are_gmt`), `exclude`, `per_page`, `page` — and
	 * advertises `X-WP-Total` / `X-WP-TotalPages` for the window it just answered. Orders can
	 * be removed between requests, which is how the "trashed mid-walk" case is exercised.
	 */
	function rangedOrderServer(orders: { wooId: number; seconds: number }[]) {
		const live = new Map(orders.map((order) => [order.wooId, order] as const));
		const fetcher = vi.fn(async (url: string) => {
			const params = new URL(url).searchParams;
			const beforeParamValue = params.get('before');
			const before = beforeParamValue === null ? Infinity : Date.parse(beforeParamValue) / 1_000;
			const afterParamValue = params.get('after');
			const after = afterParamValue === null ? -Infinity : Date.parse(afterParamValue) / 1_000;
			const excluded = new Set(
				(params.get('exclude') ?? '')
					.split(',')
					.filter(Boolean)
					.map((value) => Number(value))
			);
			const perPage = Number(params.get('per_page'));
			const page = Number(params.get('page'));
			const matching = [...live.values()]
				.filter(
					(order) => order.seconds < before && order.seconds >= after && !excluded.has(order.wooId)
				)
				.sort((left, right) => right.seconds - left.seconds || right.wooId - left.wooId);
			const slice = matching.slice((page - 1) * perPage, page * perPage);
			return rangedResponse(
				slice.map((order) => rangedOrder(order.wooId, order.seconds)),
				{
					'X-WP-Total': String(matching.length),
					'X-WP-TotalPages': String(Math.max(1, Math.ceil(matching.length / perPage))),
				}
			);
		});
		return { fetcher, trash: (wooId: number) => live.delete(wooId) };
	}

	/** The coverage lane as the Rx repository behaves: cumulative ids + the persisted cursor. */
	function rangedLaneStore() {
		let lane: {
			complete: boolean;
			fresh: boolean;
			expectedRecordIds: string[];
			rangedResume?: unknown;
		} | null = null;
		return {
			lane: () => lane,
			recordQueryResult: vi.fn(async () => undefined),
			readLocalLaneCoverage: vi.fn(async () => lane),
			publishRangedResume: vi.fn(async (input: { resume: unknown; expected: unknown }) => {
				lane = lane
					? { ...lane, rangedResume: input.resume }
					: { complete: false, fresh: true, expectedRecordIds: [], rangedResume: input.resume };
			}),
			recordCumulativeQueryResult: vi.fn(
				async (input: {
					complete: boolean;
					records: { id: string }[];
					resetCumulativeExpectedIds?: boolean;
					rangedResume?: unknown;
				}) => {
					const carried = input.resetCumulativeExpectedIds ? [] : (lane?.expectedRecordIds ?? []);
					lane = {
						complete: input.complete,
						fresh: true,
						expectedRecordIds: [...new Set([...carried, ...input.records.map((r) => r.id)])],
						...(input.rangedResume ? { rangedResume: input.rangedResume } : {}),
					};
				}
			),
		};
	}

	function rangedFetcherFor(overrides: {
		fetcher: unknown;
		coverageRepository: unknown;
		repository?: unknown;
	}) {
		return createOrdersSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository: (overrides.repository ?? {
				upsertMany: vi.fn(async () => undefined),
			}) as never,
			coverageRepository: overrides.coverageRepository as never,
			checkpointStore: {
				readCustomPullCheckpoint: vi.fn(async () => checkpoint),
				writeCustomPullCheckpoint: vi.fn(async () => undefined),
			},
			fetcher: overrides.fetcher as never,
		});
	}

	it('fetches ranged complete order descriptors until a short page', async () => {
		const repository = {
			upsertMany: vi.fn(async (_documents: PullResponse['documents']) => undefined),
		};
		const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
		const fullPage = Array.from({ length: 25 }, (_, index) =>
			rangedOrder(1_000 - index, RANGE_BASE_SECONDS - index)
		);
		const shortPage = [rangedOrder(900, RANGE_BASE_SECONDS - 500)];
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(rangedResponse(fullPage))
			.mockResolvedValueOnce(rangedResponse(shortPage));
		const schedulerFetcher = rangedFetcherFor({ fetcher, coverageRepository, repository });
		const queryKey = RANGE_QUERY_KEY;

		const result = await schedulerFetcher(
			orderTask({ id: `${queryKey}:windowed`, queryKey, limit: 25 })
		);

		// A fetch-to-completion lane walks `date desc` — the dimension its cursor is expressed in.
		expect(fetcher).toHaveBeenNthCalledWith(
			1,
			'http://wcpos.local/wp-json/wcpos/v2/orders?status=completed&after=2026-07-01T00%3A00%3A00.000Z&before=2026-07-14T23%3A59%3A59.000Z&dates_are_gmt=true&per_page=25&page=1&orderby=date&order=desc'
		);
		// The second request RE-CURSORS instead of asking for page 2: the window now ends one
		// second past the oldest record page 1 returned, with that record excluded.
		expect(fetcher).toHaveBeenNthCalledWith(
			2,
			`http://wcpos.local/wp-json/wcpos/v2/orders?status=completed&after=2026-07-01T00%3A00%3A00.000Z&before=${beforeParam(
				RANGE_BASE_SECONDS - 24 + 1
			)}&dates_are_gmt=true&exclude=976&per_page=25&page=1&orderby=date&order=desc`
		);
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(result.documentCount).toBe(26);
		// A coverage port with no cumulative channel cannot resume, so it keeps #941's behaviour.
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey, complete: true })
		);
	});

	// A range whose total is an exact multiple of the page size never short-pages, so the
	// advertised last page is the only stop signal — without it the walk keeps re-cursoring
	// into an empty window (or, before cursoring, asked for page 3 of 2 and failed the whole
	// task after every record had already been downloaded).
	it('stops ranged complete order descriptors at the advertised last page', async () => {
		const coverageRepository = rangedLaneStore();
		const { fetcher } = rangedOrderServer(
			Array.from({ length: 50 }, (_, index) => ({
				wooId: 1_000 - index,
				seconds: RANGE_BASE_SECONDS - index,
			}))
		);
		const schedulerFetcher = rangedFetcherFor({ fetcher, coverageRepository });
		const queryKey = RANGE_QUERY_KEY;

		const result = await schedulerFetcher(
			orderTask({ id: `${queryKey}:windowed`, queryKey, limit: 25 })
		);

		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(result.documentCount).toBe(50);
		expect(coverageRepository.lane()).toMatchObject({ complete: true });
		expect(coverageRepository.lane()?.rangedResume).toBeUndefined();
	});

	// #954 (a): the 10k bound is a per-PASS work budget, so tripping it leaves the lane
	// honestly incomplete AND records where the walk stopped.
	it('persists a continuation cursor when a ranged pass stops at the per-pass record bound', async () => {
		const coverageRepository = rangedLaneStore();
		const { fetcher } = rangedOrderServer(
			Array.from({ length: 25_000 }, (_, index) => ({
				wooId: 25_000 - index,
				seconds: RANGE_BASE_SECONDS - index,
			}))
		);
		const schedulerFetcher = rangedFetcherFor({ fetcher, coverageRepository });
		const queryKey = 'orders:browser:status=all:after=1782864000:search=:limit=all';

		const result = await schedulerFetcher(
			orderTask({ id: `${queryKey}:windowed`, queryKey, limit: 200 })
		);

		expect(result.documentCount).toBe(10_000);
		expect(fetcher).toHaveBeenCalledTimes(100);
		expect(coverageRepository.recordCumulativeQueryResult).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey,
				complete: false,
				resetCumulativeExpectedIds: true,
				rangedResume: {
					// One second past the oldest record taken (the 10,000th, woo id 15_001).
					beforeSeconds: RANGE_BASE_SECONDS - 9_999 + 1,
					excludeWooIds: [15_001],
					// The progress denominator: nothing covered before this pass + X-WP-Total.
					totalRecords: 25_000,
					downloadedRecords: 10_000,
				},
			})
		);
	});

	// A server that sends no `X-WP-Total` leaves the range size unknown; recording it as 0
	// would tell the cashier the download had already finished.
	it('keeps the ranged progress total unknown when the server sends no X-WP-Total', async () => {
		const coverageRepository = rangedLaneStore();
		let served = 0;
		const fetcher = vi.fn(async () => {
			const page = Array.from({ length: 100 }, (_, index) =>
				rangedOrder(25_000 - served - index, RANGE_BASE_SECONDS - served - index)
			);
			served += 100;
			return rangedResponse(page);
		});
		const schedulerFetcher = rangedFetcherFor({ fetcher, coverageRepository });
		const queryKey = 'orders:browser:status=all:after=1782864000:search=:limit=all';

		await schedulerFetcher(orderTask({ id: `${queryKey}:windowed`, queryKey, limit: 200 }));

		expect(coverageRepository.lane()?.rangedResume).toMatchObject({ totalRecords: null });
	});

	// #954 (b): the next pass resumes at the cursor and fetches ONLY the remainder.
	it('resumes a ranged walk from the persisted cursor instead of re-downloading the range', async () => {
		const cursorBeforeSeconds = RANGE_BASE_SECONDS - 9_998;
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
			recordCumulativeQueryResult: vi.fn(async () => undefined),
			// Deliberately STALE: the cursor records work already done, not a freshness claim,
			// and a multi-pass walk routinely outlives the coverage freshness window.
			readLocalLaneCoverage: vi.fn(async () => ({
				complete: false,
				fresh: false,
				expectedRecordIds: Array.from({ length: 10_000 }, (_, index) => `woo-order:${index + 1}`),
				rangedResume: {
					beforeSeconds: cursorBeforeSeconds,
					excludeWooIds: [15_001],
					totalRecords: 25_000,
				},
			})),
		};
		const fetcher = vi.fn(async () =>
			rangedResponse([rangedOrder(15_000, RANGE_BASE_SECONDS - 10_000)], {
				'X-WP-Total': '1',
				'X-WP-TotalPages': '1',
			})
		);
		const schedulerFetcher = rangedFetcherFor({ fetcher, coverageRepository });
		const queryKey = RANGE_QUERY_KEY;

		const result = await schedulerFetcher(
			orderTask({ id: `${queryKey}:windowed`, queryKey, limit: 200 })
		);

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(fetcher).toHaveBeenNthCalledWith(
			1,
			`http://wcpos.local/wp-json/wcpos/v2/orders?status=completed&after=2026-07-01T00%3A00%3A00.000Z&before=${beforeParam(
				cursorBeforeSeconds
			)}&dates_are_gmt=true&exclude=15001&per_page=100&page=1&orderby=date&order=desc`
		);
		expect(result.documentCount).toBe(1);
		expect(coverageRepository.recordCumulativeQueryResult).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey,
				complete: true,
				// The pass appends to what earlier passes covered rather than replacing it…
				resetCumulativeExpectedIds: false,
				// …and the finished walk has nothing left to resume from.
				rangedResume: null,
			})
		);
	});

	// #954 (c): the cursor lives on the coverage lane, so Clear & Sync (which bulk-removes the
	// lane rows for the collection) invalidates it with the covered-id set it belongs to.
	it('starts a fresh ranged walk when a reset has wiped the lane', async () => {
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
			recordCumulativeQueryResult: vi.fn(async () => undefined),
			readLocalLaneCoverage: vi.fn(async () => null),
		};
		const fetcher = vi.fn(async () =>
			rangedResponse([rangedOrder(500, RANGE_BASE_SECONDS)], {
				'X-WP-Total': '1',
				'X-WP-TotalPages': '1',
			})
		);
		const schedulerFetcher = rangedFetcherFor({ fetcher, coverageRepository });
		const queryKey = RANGE_QUERY_KEY;

		await schedulerFetcher(orderTask({ id: `${queryKey}:windowed`, queryKey, limit: 200 }));

		// The descriptor's own upper bound, with no narrowing and no exclusions.
		expect(fetcher).toHaveBeenNthCalledWith(
			1,
			'http://wcpos.local/wp-json/wcpos/v2/orders?status=completed&after=2026-07-01T00%3A00%3A00.000Z&before=2026-07-14T23%3A59%3A59.000Z&dates_are_gmt=true&per_page=100&page=1&orderby=date&order=desc'
		);
		expect(coverageRepository.recordCumulativeQueryResult).toHaveBeenCalledWith(
			expect.objectContaining({ resetCumulativeExpectedIds: true })
		);
	});

	// #954 (d): every pass is bounded, and a range larger than the bound converges instead of
	// re-downloading its newest window forever.
	it('converges a range larger than the per-pass bound across passes, with no gap or repeat', async () => {
		const totalOrders = 10_050;
		const coverageRepository = rangedLaneStore();
		const upserted: number[] = [];
		const repository = {
			upsertMany: vi.fn(async (documents: { remoteId: ReturnType<typeof remoteId> | null }[]) => {
				for (const document of documents)
					if (document.remoteId) upserted.push(wooIdOf(document.remoteId));
			}),
		};
		const { fetcher } = rangedOrderServer(
			Array.from({ length: totalOrders }, (_, index) => ({
				wooId: totalOrders - index,
				seconds: RANGE_BASE_SECONDS - index,
			}))
		);
		const schedulerFetcher = rangedFetcherFor({ fetcher, coverageRepository, repository });
		const queryKey = 'orders:browser:status=all:after=1782864000:search=:limit=all';
		const task = orderTask({ id: `${queryKey}:windowed`, queryKey, limit: 200 });

		const firstPass = await schedulerFetcher(task);
		expect(firstPass.documentCount).toBe(10_000);
		// The task runs GREEDY, and the runner keeps calling until this is true — claiming
		// completion after a bounded pass would strand the range at its first 10,000 records.
		expect(firstPass.completed).toBe(false);
		expect(coverageRepository.lane()).toMatchObject({ complete: false });
		expect(coverageRepository.lane()?.rangedResume).toMatchObject({ totalRecords: totalOrders });

		const secondPass = await schedulerFetcher(task);
		// Only the remainder — not another 10,000.
		expect(secondPass.documentCount).toBe(50);
		expect(secondPass.completed).toBe(true);
		expect(coverageRepository.lane()).toMatchObject({ complete: true });
		expect(coverageRepository.lane()?.rangedResume).toBeUndefined();
		expect(coverageRepository.lane()?.expectedRecordIds).toHaveLength(totalOrders);
		// No record was skipped at the resume boundary, and none was downloaded twice.
		expect(upserted).toHaveLength(totalOrders);
		expect(new Set(upserted).size).toBe(totalOrders);
	});

	// The cursor is a DATE bound, not a page offset: an order trashed after its page was served
	// shifts every positional cursor by one slot and would silently skip a record.
	it('does not skip records when an order is trashed mid-walk', async () => {
		const totalOrders = 250;
		const coverageRepository = rangedLaneStore();
		const upserted: number[] = [];
		const repository = {
			upsertMany: vi.fn(async (documents: { remoteId: ReturnType<typeof remoteId> | null }[]) => {
				for (const document of documents)
					if (document.remoteId) upserted.push(wooIdOf(document.remoteId));
			}),
		};
		const server = rangedOrderServer(
			Array.from({ length: totalOrders }, (_, index) => ({
				wooId: totalOrders - index,
				seconds: RANGE_BASE_SECONDS - index,
			}))
		);
		const fetcher = vi.fn(async (url: string) => {
			const response = await server.fetcher(url);
			// Trash an already-served order right after the first page.
			server.trash(250);
			return response;
		});
		const schedulerFetcher = rangedFetcherFor({ fetcher, coverageRepository, repository });
		const queryKey = 'orders:browser:status=all:after=1782864000:search=:limit=all';

		await schedulerFetcher(orderTask({ id: `${queryKey}:windowed`, queryKey, limit: 200 }));

		expect(coverageRepository.lane()).toMatchObject({ complete: true });
		expect(new Set(upserted).size).toBe(totalOrders);
	});

	// Orders sharing one creation second straddling a page boundary must be neither missed nor
	// re-downloaded: the cursor re-requests that second and excludes the ids already taken.
	it('carries a boundary-second tie group across the page cursor exactly once', async () => {
		const coverageRepository = rangedLaneStore();
		const upserted: number[] = [];
		const repository = {
			upsertMany: vi.fn(async (documents: { remoteId: ReturnType<typeof remoteId> | null }[]) => {
				for (const document of documents)
					if (document.remoteId) upserted.push(wooIdOf(document.remoteId));
			}),
		};
		// 40 orders of which THIRTY (ids 40…11) share one second — more than the 25-record page,
		// so the tie group genuinely straddles the page boundary and the cursor cannot move past
		// that second on the first page. This is what exercises the accumulate-exclusions branch:
		// a fixture whose tie group fits inside one page only ever takes the `advanced` branch.
		const { fetcher } = rangedOrderServer(
			Array.from({ length: 40 }, (_, index) => ({
				wooId: 40 - index,
				seconds: index < 30 ? RANGE_BASE_SECONDS : RANGE_BASE_SECONDS - index,
			}))
		);
		const schedulerFetcher = rangedFetcherFor({ fetcher, coverageRepository, repository });
		const queryKey = RANGE_QUERY_KEY;

		await schedulerFetcher(orderTask({ id: `${queryKey}:windowed`, queryKey, limit: 25 }));

		// The second request re-asks for the SAME second with the 25 ids already taken excluded.
		const secondRequest = new URL(fetcher.mock.calls[1][0] as string).searchParams;
		expect(secondRequest.get('exclude')?.split(',')).toHaveLength(25);
		expect(secondRequest.get('before')).toBe(
			new Date((RANGE_BASE_SECONDS + 1) * 1_000).toISOString()
		);

		expect(coverageRepository.lane()).toMatchObject({ complete: true });
		expect(upserted).toHaveLength(40);
		expect(new Set(upserted).size).toBe(40);
	});

	// #954: the progress line reads the lane, and the id set is only written when a pass ENDS —
	// so without a per-page publish the line stays dark for the whole first pass, which is the
	// entire walk for any range under the per-pass bound.
	it('publishes ranged progress after every page, not just at the end of a pass', async () => {
		const coverageRepository = rangedLaneStore();
		const { fetcher } = rangedOrderServer(
			Array.from({ length: 250 }, (_, index) => ({
				wooId: 250 - index,
				seconds: RANGE_BASE_SECONDS - index,
			}))
		);
		const schedulerFetcher = rangedFetcherFor({ fetcher, coverageRepository });
		const queryKey = RANGE_QUERY_KEY;

		await schedulerFetcher(orderTask({ id: `${queryKey}:windowed`, queryKey, limit: 200 }));

		// Three pages → three publishes, each carrying a growing count against the same total.
		expect(coverageRepository.publishRangedResume).toHaveBeenCalledTimes(3);
		expect(
			coverageRepository.publishRangedResume.mock.calls.map(
				(call) =>
					(call[0] as { resume: { downloadedRecords: number; totalRecords: number } }).resume
			)
		).toEqual([
			expect.objectContaining({ downloadedRecords: 100, totalRecords: 250 }),
			expect.objectContaining({ downloadedRecords: 200, totalRecords: 250 }),
			expect.objectContaining({ downloadedRecords: 250, totalRecords: 250 }),
		]);
		// Each publish declares the cursor it is replacing, so a lane wiped mid-pass is caught at
		// the very next write rather than at the end of a 10,000-record pass.
		const expectations = coverageRepository.publishRangedResume.mock.calls.map(
			(call) => (call[0] as { expected: unknown }).expected
		);
		expect(expectations[0]).toBeNull();
		expect(expectations[1]).toEqual(expect.objectContaining({ downloadedRecords: 100 }));
	});

	// A server that ignores the POS dimensions answers with the unfiltered superset.
	// `dimensionsHonored` is PER-PASS evidence, so a cursor left behind by a superset pass could
	// be completed by a later pass that happened to see only matching records — reporting every
	// cashier's orders as this cashier's total. The cursor must not survive such a pass.
	it('leaves no cursor behind when the server ignored the requested POS dimensions', async () => {
		const coverageRepository = rangedLaneStore();
		// 300 orders, none carrying the `_pos_user` meta the descriptor asked for.
		let served = 0;
		const fetcher = vi.fn(async () => {
			const page = Array.from({ length: 100 }, (_, index) =>
				rangedOrder(10_000 - served - index, RANGE_BASE_SECONDS - served - index)
			);
			served += 100;
			return rangedResponse(page, { 'X-WP-Total': '30000', 'X-WP-TotalPages': '300' });
		});
		const schedulerFetcher = rangedFetcherFor({ fetcher, coverageRepository });
		const queryKey = 'orders:browser:status=all:cashier=7:after=1782864000:search=:limit=all';

		await schedulerFetcher(orderTask({ id: `${queryKey}:windowed`, queryKey, limit: 200 }));

		expect(coverageRepository.lane()).toMatchObject({ complete: false });
		expect(coverageRepository.lane()?.rangedResume).toBeUndefined();
	});

	// A tie group too large to express as an `exclude` list cannot be resumed without either
	// skipping records or looping, so the pass fails loudly and the lane stays incomplete.
	it('fails a ranged pass rather than resume past an unbounded boundary second', async () => {
		const coverageRepository = rangedLaneStore();
		const { fetcher } = rangedOrderServer(
			Array.from({ length: 2_000 }, (_, index) => ({
				wooId: 2_000 - index,
				seconds: RANGE_BASE_SECONDS,
			}))
		);
		const schedulerFetcher = rangedFetcherFor({ fetcher, coverageRepository });
		const queryKey = RANGE_QUERY_KEY;

		await expect(
			schedulerFetcher(orderTask({ id: `${queryKey}:windowed`, queryKey, limit: 200 }))
		).rejects.toThrow(/share the boundary second/);
		// The pages it did read are published, so the lane exists — but it never claims
		// completeness, which is the property that matters.
		expect(coverageRepository.lane()?.complete).not.toBe(true);
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
			'http://wcpos.local/wp-json/wcpos/v2/orders?status=processing&search=hat&per_page=50&page=1&orderby=id&order=desc'
		);
		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({
				uuid: uuidFor(789),
				remoteId: remoteId(789),
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
				uuid: uuidFor(789),
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
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

	/**
	 * #946 — sub-cent monetary precision.
	 *
	 * 1.9 pinned `dp=6` on every order read so monetary fields arrived with six
	 * decimals; the sync rewrite dropped the client-side param (#639 severed the call
	 * site, #662 deleted the producer and its test together) and the v2 lane never
	 * carried over 1.9's SERVER-side pin
	 * (`V1\Orders_Controller::wcpos_dispatch_request` → `$request->set_param('dp','6')`).
	 *
	 * The restoration has to happen server-side, NOT here — see the monetary-precision
	 * warning above the read URL builders in rx-scheduler-order-fetcher.ts. What the client owes
	 * the contract is that it carries whatever precision the server sends through to
	 * storage verbatim: no reformatting, no rounding to display decimals. This is the
	 * half of #946 that lives on this side of the wire. Every scheduler-owned read
	 * shape is pinned here; the independent reconciliation read is pinned through
	 * the public facade in create-rxdb-sync-engine.existence.test.ts.
	 */
	describe('preserves server monetary precision verbatim on every scheduler read shape (#946)', () => {
		// A 6dp payload as wc/v3 serves it under `dp=6`: sub-cent tax components that
		// round away entirely at the store's display decimals (2dp).
		const sixDecimalMoney = {
			total: '10.123456',
			total_tax: '1.234567',
			line_items: [
				{
					id: 1,
					total: '8.888889',
					total_tax: '0.740741',
					taxes: [{ id: 1, total: '0.740741', subtotal: '0.740741' }],
				},
			],
			tax_lines: [{ id: 2, tax_total: '1.234567', shipping_tax_total: '0.000001' }],
		};

		function sixDecimalPayload(wooId: number) {
			return {
				id: wooId,
				date_modified_gmt: '2026-05-20T10:00:00',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(wooId) }],
				...sixDecimalMoney,
			};
		}

		type ReadShape = {
			name: string;
			task: FetchTask;
			body: (wooId: number) => PullResponse<WirePullDocument> | unknown[];
		};

		const readShapes: ReadShape[] = [
			{
				name: 'custom-pull',
				task: orderTask(),
				body: (wooId) => ({
					documents: [
						{
							...customPullDoc(wooId),
							payload: sixDecimalPayload(wooId),
						},
					] as WirePullDocument[],
					checkpoint: nextCheckpoint,
					hasMore: false,
				}),
			},
			{
				name: 'browse',
				task: orderTask({
					id: 'orders:browser:processing:windowed',
					requirementId: 'orders.browser.processing',
					queryKey: 'orders:browser:status=processing:search=:limit=50',
				}),
				body: (wooId) => [{ ...sixDecimalPayload(wooId), status: 'processing' }],
			},
			{
				name: 'ranged/report',
				task: orderTask({
					id: 'orders:browser:ranged:windowed',
					requirementId: 'orders.browser.ranged',
					queryKey: 'orders:browser:status=any:after=1747699200:before=1747785600:search=:limit=50',
				}),
				body: (wooId) => [sixDecimalPayload(wooId)],
			},
			{
				name: 'targeted include',
				task: orderTask({
					id: 'orders:ids:bulk:on-demand',
					requirementId: 'orders.bulk-deep-link',
					queryKey: 'orders:ids:bulk',
					ids: ['woo-order:77'],
					remoteIds: [77].map(remoteId),
					limit: 1,
					mode: 'on-demand',
				}),
				body: (wooId) => [sixDecimalPayload(wooId)],
			},
		];

		it.each(readShapes)('$name', async ({ task, body }) => {
			const wooId = wooIdOf(task.remoteIds?.[0] ?? remoteId(77));
			const upserted: PullResponse['documents'] = [];
			const repository = {
				upsertMany: vi.fn(async (documents: PullResponse['documents']) => {
					upserted.push(...documents);
				}),
			};
			const schedulerFetcher = createOrdersSchedulerFetcher({
				baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
				repository,
				checkpointStore: {
					readCustomPullCheckpoint: vi.fn(async () => checkpoint),
					writeCustomPullCheckpoint: vi.fn(async () => undefined),
				},
				fetcher: vi.fn(async (url: string) => {
					expect(new URL(url).searchParams.has('dp')).toBe(false);
					return response(body(wooId));
				}),
			});

			await schedulerFetcher(task);

			expect(upserted).toHaveLength(1);
			// Every monetary string round-trips byte-for-byte: the sub-cent digits the
			// server sent are still there after materialization.
			expect(upserted[0].payload).toMatchObject(sixDecimalMoney);
		});
	});
});
