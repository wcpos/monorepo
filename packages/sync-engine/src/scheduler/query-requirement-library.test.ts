// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
	buildSchedulerCoverageRequirementsFromDeclarations,
	type QueryRequirementDeclaration,
	runQueryRequirementFlow,
} from './query-requirement-library';

const freshCoverage = {
	records: [
		{ collection: 'orders', id: 'woo-order:114', fresh: true },
		{ collection: 'customers', id: 'customer:default', fresh: true },
	],
	lanes: [
		{ collection: 'products', queryKey: 'products:search:keyboard', complete: true, fresh: true },
	],
};

function queryDeclaration(
	overrides: Partial<QueryRequirementDeclaration> &
		Pick<QueryRequirementDeclaration, 'componentId' | 'id' | 'collection' | 'queryKey'>
): QueryRequirementDeclaration {
	return {
		componentId: overrides.componentId,
		id: overrides.id,
		collection: overrides.collection,
		kind: overrides.kind ?? 'query',
		queryKey: overrides.queryKey,
		ids: overrides.ids,
		wooIds: overrides.wooIds,
		expectedRecordIds: overrides.expectedRecordIds,
		currentRecordIds: overrides.currentRecordIds,
		totalMatchingRecords: overrides.totalMatchingRecords,
		coverageStrategy: overrides.coverageStrategy ?? 'record-and-lane',
		policy: overrides.policy ?? {
			mode: 'windowed',
			priority: 100,
			batchSize: 10,
			offline: { read: 'serve-local', write: 'queue' },
		},
	};
}

describe('buildSchedulerCoverageRequirementsFromDeclarations', () => {
	it('converts component-declared queries into scheduler coverage requirements', () => {
		const requirements = buildSchedulerCoverageRequirementsFromDeclarations({
			coverageState: freshCoverage,
			declarations: [
				queryDeclaration({
					componentId: 'ProductSearch',
					id: 'products.search.keyboard',
					collection: 'products',
					queryKey: 'products:search:keyboard',
					expectedRecordIds: ['product:keyboard'],
				}),
			],
		});

		expect(requirements).toHaveLength(1);
		expect(requirements[0].requirement).toMatchObject({
			id: 'products.search.keyboard',
			collection: 'products',
			kind: 'query',
			queryKey: 'products:search:keyboard',
		});
		expect(requirements[0].expectedRecordIds).toEqual(['product:keyboard']);
		expect(requirements[0].coverageState).toBe(freshCoverage);
	});

	it("carries a targeted declaration's wooIds onto the requirement — the only channel a targeted fetcher reads", () => {
		// Document keys are uuids, so the numeric server id is unrecoverable from `ids`; a
		// declaration that omitted wooIds would mint a task the order/product fetchers reject
		// as a contract error. toRequirement must propagate the channel, never drop it.
		const requirements = buildSchedulerCoverageRequirementsFromDeclarations({
			coverageState: freshCoverage,
			declarations: [
				queryDeclaration({
					componentId: 'DeepLinkRouter',
					id: 'orders.deepLink.114',
					collection: 'orders',
					kind: 'targeted-records',
					queryKey: 'orders:ids:114',
					ids: ['woo-order:114'],
					wooIds: [114],
				}),
			],
		});

		expect(requirements).toHaveLength(1);
		expect(requirements[0].requirement).toMatchObject({
			kind: 'targeted-records',
			ids: ['woo-order:114'],
			wooIds: [114],
		});
	});

	it('coalesces same-ids targeted declarations to the union of their wooIds — first-without never wins', () => {
		// The coalescing key ignores wooIds, and the merge used to keep the FIRST requirement:
		// a first-without-wooIds + later-with-wooIds pair coalesced to wooIds: undefined and
		// the minted task failed the fetcher contract error. The merge must union the channel.
		const requirements = buildSchedulerCoverageRequirementsFromDeclarations({
			coverageState: freshCoverage,
			declarations: [
				queryDeclaration({
					componentId: 'LegacyDeepLink',
					id: 'orders.deepLink.114',
					collection: 'orders',
					kind: 'targeted-records',
					queryKey: 'orders:ids:114',
					ids: ['woo-order:114'],
				}),
				queryDeclaration({
					componentId: 'OrderDetailsRoute',
					id: 'orders.deepLink.114',
					collection: 'orders',
					kind: 'targeted-records',
					queryKey: 'orders:ids:114',
					ids: ['woo-order:114'],
					wooIds: [114],
				}),
			],
		});

		expect(requirements).toHaveLength(1);
		expect(requirements[0].requirement.wooIds).toEqual([114]);
		expect(requirements[0].declaredBy).toEqual(['LegacyDeepLink', 'OrderDetailsRoute']);
	});

	it('coalesces duplicate declarations while preserving requesting component ids and highest priority', () => {
		const requirements = buildSchedulerCoverageRequirementsFromDeclarations({
			coverageState: freshCoverage,
			declarations: [
				queryDeclaration({
					componentId: 'ProductGrid',
					id: 'products.search.keyboard',
					collection: 'products',
					queryKey: 'products:search:keyboard',
					expectedRecordIds: ['product:alpha'],
					policy: {
						mode: 'windowed',
						priority: 100,
						batchSize: 10,
						offline: { read: 'serve-local', write: 'queue' },
					},
				}),
				queryDeclaration({
					componentId: 'ProductSearchBox',
					id: 'products.search.keyboard',
					collection: 'products',
					queryKey: 'products:search:keyboard',
					expectedRecordIds: ['product:keyboard'],
					policy: {
						mode: 'windowed',
						priority: 900,
						batchSize: 10,
						offline: { read: 'serve-local', write: 'queue' },
					},
				}),
			],
		});

		expect(requirements).toHaveLength(1);
		expect(requirements[0].requirement.policy.priority).toBe(900);
		expect(requirements[0].expectedRecordIds).toEqual(['product:alpha', 'product:keyboard']);
		expect(requirements[0].declaredBy).toEqual(['ProductGrid', 'ProductSearchBox']);
	});

	it('merges duplicate declarations to the strictest coverage strategy independent of declaration order', async () => {
		const fetcher = vi.fn(async (task) => ({
			taskId: task.id,
			documentCount: task.limit,
			requestCount: 1,
			completed: true,
		}));

		const result = await runQueryRequirementFlow({
			connectivity: 'online',
			coverageState: freshCoverage,
			declarations: [
				queryDeclaration({
					componentId: 'ProductLaneConsumer',
					id: 'products.search.keyboard',
					collection: 'products',
					queryKey: 'products:search:keyboard',
					coverageStrategy: 'lane-only',
				}),
				queryDeclaration({
					componentId: 'ProductRecordConsumer',
					id: 'products.search.keyboard',
					collection: 'products',
					queryKey: 'products:search:keyboard',
					expectedRecordIds: ['product:missing'],
					coverageStrategy: 'record-and-lane',
				}),
			],
			fetcher,
		});

		expect(result.requirements).toHaveLength(1);
		expect(result.requirements[0].coverageStrategy).toBe('record-and-lane');
		expect(result.coverageFlow.scheduler.tasks.map((task) => task.requirementId)).toEqual([
			'products.search.keyboard',
		]);

		const reverseOrderResult = await runQueryRequirementFlow({
			connectivity: 'online',
			coverageState: freshCoverage,
			declarations: [
				queryDeclaration({
					componentId: 'ProductRecordConsumer',
					id: 'products.search.keyboard',
					collection: 'products',
					queryKey: 'products:search:keyboard',
					expectedRecordIds: ['product:missing'],
					coverageStrategy: 'record-and-lane',
				}),
				queryDeclaration({
					componentId: 'ProductLaneConsumer',
					id: 'products.search.keyboard',
					collection: 'products',
					queryKey: 'products:search:keyboard',
					coverageStrategy: 'lane-only',
				}),
			],
			fetcher,
		});

		expect(reverseOrderResult.requirements).toHaveLength(1);
		expect(reverseOrderResult.requirements[0].coverageStrategy).toBe('record-and-lane');
		expect(
			reverseOrderResult.coverageFlow.scheduler.tasks.map((task) => task.requirementId)
		).toEqual(['products.search.keyboard']);

		const mixedRecordAndLaneResult = await runQueryRequirementFlow({
			connectivity: 'online',
			coverageState: freshCoverage,
			declarations: [
				queryDeclaration({
					componentId: 'ProductRecordConsumer',
					id: 'products.search.keyboard',
					collection: 'products',
					queryKey: 'products:search:keyboard',
					expectedRecordIds: ['product:missing'],
					coverageStrategy: 'record-only',
				}),
				queryDeclaration({
					componentId: 'ProductLaneConsumer',
					id: 'products.search.keyboard',
					collection: 'products',
					queryKey: 'products:search:keyboard',
					coverageStrategy: 'lane-only',
				}),
			],
			fetcher,
		});

		expect(mixedRecordAndLaneResult.requirements).toHaveLength(1);
		expect(mixedRecordAndLaneResult.requirements[0].coverageStrategy).toBe('record-and-lane');
		expect(
			mixedRecordAndLaneResult.coverageFlow.scheduler.tasks.map((task) => task.requirementId)
		).toEqual(['products.search.keyboard']);
	});

	it('coalesces current query evidence so record-and-lane gates can reject stale lane assumptions', async () => {
		const fetcher = vi.fn(async (task) => ({
			taskId: task.id,
			documentCount: task.limit,
			requestCount: 1,
			completed: true,
		}));

		const result = await runQueryRequirementFlow({
			connectivity: 'online',
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
			declarations: [
				queryDeclaration({
					componentId: 'ProductGrid',
					id: 'products.search.coffee',
					collection: 'products',
					queryKey: 'products:search:coffee',
					expectedRecordIds: ['product:alpha'],
					currentRecordIds: ['product:alpha'],
					totalMatchingRecords: 2,
					coverageStrategy: 'record-and-lane',
				}),
				queryDeclaration({
					componentId: 'ProductSearchSummary',
					id: 'products.search.coffee',
					collection: 'products',
					queryKey: 'products:search:coffee',
					expectedRecordIds: ['product:beta'],
					currentRecordIds: ['product:beta'],
					totalMatchingRecords: 3,
					coverageStrategy: 'record-and-lane',
				}),
			],
			fetcher,
		});

		expect(result.requirements).toHaveLength(1);
		expect(result.requirements[0].expectedRecordIds).toEqual(['product:alpha', 'product:beta']);
		expect(result.requirements[0].currentRecordIds).toEqual(['product:alpha', 'product:beta']);
		expect(result.requirements[0].totalMatchingRecords).toBe(3);
		expect(result.coverageFlow.coverageDecisions[0]).toMatchObject({
			action: 'fetch-remote',
			reason: 'current query evidence proves more matching records than the complete lane expected',
		});
		expect(result.coverageFlow.scheduler.tasks.map((task) => task.requirementId)).toEqual([
			'products.search.coffee',
		]);
	});

	it('keeps targeted record declarations local when coverage has the fresh record', async () => {
		const fetcher = vi.fn(async (task) => ({
			taskId: task.id,
			documentCount: task.limit,
			requestCount: 1,
			completed: true,
		}));

		const result = await runQueryRequirementFlow({
			connectivity: 'online',
			coverageState: freshCoverage,
			declarations: [
				queryDeclaration({
					componentId: 'OrderDeepLink',
					id: 'orders.deepLink.114',
					collection: 'orders',
					kind: 'targeted-records',
					queryKey: 'orders:ids:114',
					ids: ['woo-order:114'],
					policy: {
						mode: 'on-demand',
						priority: 950,
						batchSize: 1,
						offline: { read: 'fail-if-missing', write: 'queue' },
					},
				}),
			],
			fetcher,
		});

		expect(result.coverageFlow.servedLocal.map((decision) => decision.requirementId)).toEqual([
			'orders.deepLink.114',
		]);
		expect(result.coverageFlow.scheduler.tasks).toEqual([]);
		expect(fetcher).not.toHaveBeenCalled();
	});
});
