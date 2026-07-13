// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { runPersistedCoverageQueryRequirementFlow } from './persisted-coverage-query-flow';

import type { FetchTask, ReplicationPolicy } from './replication-policy';
import type { SchedulerFetcher } from './replication-scheduler';
import type { PersistedCoverageDocumentSet } from './persisted-coverage-schema';

const policy: ReplicationPolicy = {
	mode: 'on-demand',
	priority: 5,
	batchSize: 10,
	maxRequests: 1,
	offline: { read: 'fail-if-missing', write: 'queue' },
};

function fetcher(): SchedulerFetcher {
	return vi.fn(async (task: FetchTask) => ({
		taskId: task.id,
		documentCount: 0,
		requestCount: 1,
		completed: true,
	}));
}

describe('persisted coverage query flow', () => {
	it('uses fresh persisted lane expected ids to serve query declarations locally', async () => {
		const documents: PersistedCoverageDocumentSet = {
			records: [
				{
					collection: 'orders',
					id: 'order-1',
					coveredQueryKeys: ['orders:open'],
					freshUntilMs: 2_000,
					updatedAtMs: 1_000,
				},
				{
					collection: 'orders',
					id: 'order-2',
					coveredQueryKeys: ['orders:open'],
					freshUntilMs: 2_000,
					updatedAtMs: 1_000,
				},
			],
			lanes: [
				{
					collection: 'orders',
					queryKey: 'orders:open',
					complete: true,
					expectedRecordIds: ['order-1', 'order-2'],
					freshUntilMs: 2_000,
					updatedAtMs: 1_000,
				},
			],
		};
		const remoteFetch = fetcher();

		const result = await runPersistedCoverageQueryRequirementFlow({
			connectivity: 'online',
			documents,
			nowMs: 1_500,
			declarations: [
				{
					componentId: 'OpenOrders',
					id: 'orders.open',
					collection: 'orders',
					queryKey: 'orders:open',
					coverageStrategy: 'record-and-lane',
					policy,
				},
			],
			fetcher: remoteFetch,
		});

		expect(result.requirements[0].expectedRecordIds).toEqual(['order-1', 'order-2']);
		expect(result.coverageFlow.summary).toEqual(
			expect.objectContaining({ servedLocal: 1, remoteTasks: 0, totalRequests: 0 })
		);
		expect(remoteFetch).not.toHaveBeenCalled();
	});

	it('serves a fresh complete persisted lane with zero expected records locally', async () => {
		const documents: PersistedCoverageDocumentSet = {
			records: [],
			lanes: [
				{
					collection: 'orders',
					queryKey: 'orders:empty',
					complete: true,
					expectedRecordIds: [],
					freshUntilMs: 2_000,
					updatedAtMs: 1_000,
				},
			],
		};
		const remoteFetch = fetcher();

		const result = await runPersistedCoverageQueryRequirementFlow({
			connectivity: 'online',
			documents,
			nowMs: 1_500,
			declarations: [
				{
					componentId: 'EmptyOrders',
					id: 'orders.empty',
					collection: 'orders',
					queryKey: 'orders:empty',
					coverageStrategy: 'record-and-lane',
					policy,
				},
			],
			fetcher: remoteFetch,
		});

		expect(result.requirements[0].expectedRecordIds).toEqual([]);
		expect(result.coverageFlow.summary).toEqual(
			expect.objectContaining({ servedLocal: 1, remoteTasks: 0, totalRequests: 0 })
		);
		expect(remoteFetch).not.toHaveBeenCalled();
	});

	it('does not trust stale persisted lane expected ids for query declarations', async () => {
		const documents: PersistedCoverageDocumentSet = {
			records: [
				{
					collection: 'orders',
					id: 'order-1',
					coveredQueryKeys: ['orders:open'],
					freshUntilMs: 2_000,
					updatedAtMs: 1_000,
				},
			],
			lanes: [
				{
					collection: 'orders',
					queryKey: 'orders:open',
					complete: true,
					expectedRecordIds: ['order-1'],
					freshUntilMs: 1_000,
					updatedAtMs: 900,
				},
			],
		};
		const remoteFetch = fetcher();

		const result = await runPersistedCoverageQueryRequirementFlow({
			connectivity: 'online',
			documents,
			nowMs: 1_500,
			declarations: [
				{
					componentId: 'OpenOrders',
					id: 'orders.open',
					collection: 'orders',
					queryKey: 'orders:open',
					coverageStrategy: 'record-and-lane',
					policy,
				},
			],
			fetcher: remoteFetch,
		});

		expect(result.requirements[0].expectedRecordIds).toEqual([]);
		expect(result.coverageFlow.summary).toEqual(
			expect.objectContaining({ servedLocal: 0, remoteTasks: 1, totalRequests: 1 })
		);
		expect(remoteFetch).toHaveBeenCalledWith(
			expect.objectContaining({ requirementId: 'orders.open' })
		);
	});

	it('preserves explicit empty expected ids from current complete query evidence', async () => {
		const documents: PersistedCoverageDocumentSet = {
			records: [],
			lanes: [
				{
					collection: 'products',
					queryKey: 'products:search=none',
					complete: true,
					expectedRecordIds: ['product:stale'],
					freshUntilMs: 2_000,
					updatedAtMs: 1_000,
				},
			],
		};
		const remoteFetch = fetcher();

		const result = await runPersistedCoverageQueryRequirementFlow({
			connectivity: 'online',
			documents,
			nowMs: 1_500,
			declarations: [
				{
					componentId: 'ProductGrid',
					id: 'products.search.none',
					collection: 'products',
					queryKey: 'products:search=none',
					expectedRecordIds: [],
					currentRecordIds: [],
					totalMatchingRecords: 0,
					coverageStrategy: 'record-and-lane',
					policy,
				},
			],
			fetcher: remoteFetch,
		});

		expect(result.requirements[0].expectedRecordIds).toEqual([]);
		expect(result.coverageFlow.summary).toEqual(
			expect.objectContaining({ servedLocal: 1, remoteTasks: 0, totalRequests: 0 })
		);
		expect(remoteFetch).not.toHaveBeenCalled();
	});
});
