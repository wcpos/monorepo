// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
	runSchedulerCoverageFlow,
	type SchedulerCoverageFlowRequirement,
} from './scheduler-coverage-flow';

import type { ReplicationRequirement } from './replication-policy';

function requirement(
	overrides: Partial<ReplicationRequirement> & Pick<ReplicationRequirement, 'id' | 'collection'>
): ReplicationRequirement {
	return {
		id: overrides.id,
		collection: overrides.collection,
		kind: overrides.kind ?? 'query',
		queryKey: overrides.queryKey ?? overrides.id,
		ids: overrides.ids,
		policy: {
			mode: overrides.policy?.mode ?? 'windowed',
			priority: overrides.policy?.priority ?? 100,
			batchSize: overrides.policy?.batchSize ?? 10,
			maxRequests: overrides.policy?.maxRequests,
			pollingIntervalMs: overrides.policy?.pollingIntervalMs,
			staleAfterMs: overrides.policy?.staleAfterMs,
			offline: overrides.policy?.offline ?? { read: 'serve-local', write: 'queue' },
		},
	};
}

function flowRequirement(
	input: SchedulerCoverageFlowRequirement
): SchedulerCoverageFlowRequirement {
	return input;
}

describe('runSchedulerCoverageFlow', () => {
	it('uses coverage decisions before scheduling remote work', async () => {
		const defaultCustomer = requirement({
			id: 'customers.default',
			collection: 'customers',
			kind: 'targeted-records',
			queryKey: 'customers:ids:default',
			ids: ['customer:default'],
			policy: {
				mode: 'on-demand',
				priority: 950,
				batchSize: 1,
				offline: { read: 'fail-if-missing', write: 'queue' },
			},
		});
		const taxRates = requirement({
			id: 'taxRates.all',
			collection: 'taxRates',
			kind: 'lane',
			queryKey: 'taxRates:all',
			policy: {
				mode: 'greedy',
				priority: 1000,
				batchSize: 10,
				offline: { read: 'fail-if-missing', write: 'reject' },
			},
		});
		const fetcher = vi.fn(async (task) => ({
			taskId: task.id,
			documentCount: task.limit,
			requestCount: 1,
			completed: true,
		}));

		const result = await runSchedulerCoverageFlow({
			connectivity: 'online',
			requirements: [
				flowRequirement({
					requirement: defaultCustomer,
					coverageStrategy: 'record-and-lane',
					coverageState: {
						records: [{ collection: 'customers', id: 'customer:default', fresh: true }],
						lanes: [],
					},
				}),
				flowRequirement({
					requirement: taxRates,
					coverageStrategy: 'record-and-lane',
					coverageState: { records: [], lanes: [] },
				}),
			],
			fetcher,
		});

		expect(result.servedLocal.map((decision) => decision.requirementId)).toEqual([
			'customers.default',
		]);
		expect(result.scheduler.tasks.map((task) => task.requirementId)).toEqual(['taxRates.all']);
		expect(result.summary).toMatchObject({
			servedLocal: 1,
			remoteTasks: 1,
			skipped: 0,
			totalRequests: 1,
			totalDocuments: 10,
		});
	});

	it('preserves user-triggered preemption after coverage filters remote requirements', async () => {
		const productSearch = requirement({
			id: 'products.search.keyboard',
			collection: 'products',
			queryKey: 'products:search:keyboard',
			policy: {
				mode: 'windowed',
				priority: 900,
				batchSize: 10,
				offline: { read: 'serve-local', write: 'queue' },
			},
		});
		const backgroundPoll = requirement({
			id: 'products.backgroundPoll',
			collection: 'products',
			kind: 'lane',
			queryKey: 'products:background-poll',
			policy: {
				mode: 'windowed',
				priority: 100,
				batchSize: 25,
				offline: { read: 'serve-local', write: 'queue' },
			},
		});
		const fetcher = vi.fn(async (task) => ({
			taskId: task.id,
			documentCount: task.limit,
			requestCount: 1,
			completed: true,
		}));

		const result = await runSchedulerCoverageFlow({
			connectivity: 'online',
			requirements: [productSearch, backgroundPoll].map((item) =>
				flowRequirement({
					requirement: item,
					coverageStrategy: 'record-and-lane',
					coverageState: { records: [], lanes: [] },
					expectedRecordIds:
						item.id === 'products.search.keyboard' ? ['product:keyboard'] : undefined,
				})
			),
			fetcher,
		});

		expect(result.scheduler.tasks.map((task) => task.requirementId)).toEqual([
			'products.search.keyboard',
			'products.backgroundPoll',
		]);
	});

	it('uses current query evidence before serving complete query lanes locally', async () => {
		const productSearch = requirement({
			id: 'products.search.coffee',
			collection: 'products',
			queryKey: 'products:search:coffee',
			policy: {
				mode: 'windowed',
				priority: 700,
				batchSize: 10,
				offline: { read: 'serve-local', write: 'queue' },
			},
		});
		const fetcher = vi.fn(async (task) => ({
			taskId: task.id,
			documentCount: task.limit,
			requestCount: 1,
			completed: true,
		}));

		const result = await runSchedulerCoverageFlow({
			connectivity: 'online',
			requirements: [
				flowRequirement({
					requirement: productSearch,
					coverageStrategy: 'record-and-lane',
					coverageState: {
						records: [
							{ collection: 'products', id: 'product:alpha', fresh: true },
							{ collection: 'products', id: 'product:beta', fresh: true },
						],
						lanes: [
							{
								collection: 'products',
								queryKey: 'products:search:coffee',
								complete: true,
								fresh: true,
							},
						],
					},
					expectedRecordIds: ['product:alpha', 'product:beta'],
					currentRecordIds: ['product:alpha', 'product:beta'],
					totalMatchingRecords: 3,
				}),
			],
			fetcher,
		});

		expect(result.servedLocal).toEqual([]);
		expect(result.coverageDecisions[0]).toMatchObject({
			requirementId: 'products.search.coffee',
			action: 'fetch-remote',
			reason: 'current query evidence proves more matching records than the complete lane expected',
		});
		expect(result.scheduler.tasks.map((task) => task.requirementId)).toEqual([
			'products.search.coffee',
		]);
	});

	it('reports offline skips for requirements that need remote freshness', async () => {
		const deepLinkedOrder = requirement({
			id: 'orders.deepLink.114',
			collection: 'orders',
			kind: 'targeted-records',
			queryKey: 'orders:ids:114',
			ids: ['woo-order:114'],
			policy: {
				mode: 'on-demand',
				priority: 1000,
				batchSize: 1,
				offline: { read: 'fail-if-missing', write: 'queue' },
			},
		});
		const fetcher = vi.fn(async (task) => ({
			taskId: task.id,
			documentCount: task.limit,
			requestCount: 1,
			completed: true,
		}));

		const result = await runSchedulerCoverageFlow({
			connectivity: 'offline',
			requirements: [
				flowRequirement({
					requirement: deepLinkedOrder,
					coverageStrategy: 'record-and-lane',
					coverageState: { records: [], lanes: [] },
				}),
			],
			fetcher,
		});

		expect(result.scheduler.tasks).toEqual([]);
		expect(result.scheduler.skipped).toEqual([
			{
				requirementId: 'orders.deepLink.114',
				reason: 'offline: required remote data is unavailable',
			},
		]);
		expect(result.summary).toMatchObject({ servedLocal: 0, remoteTasks: 0, skipped: 1 });
	});
});
