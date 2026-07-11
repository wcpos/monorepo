import {
	type QueryRequirementDeclaration,
	type QueryRequirementFlowResult,
	runQueryRequirementFlow,
} from './query-requirement-library';

import type {
	ConnectivityMode,
	FetchTask,
	FetchTaskResult,
	ReplicationPolicy,
} from './replication-policy';
import type { LocalCoverageState } from './coverage-model';

export type QueryRequirementLibraryScenario = {
	id: string;
	label: string;
	description: string;
	connectivity: ConnectivityMode;
	coverageState: LocalCoverageState;
	declarations: QueryRequirementDeclaration[];
};

const serveLocalPolicy: ReplicationPolicy = {
	mode: 'windowed',
	priority: 100,
	batchSize: 10,
	offline: { read: 'serve-local', write: 'queue' },
};
const defaultCustomerPolicy: ReplicationPolicy = {
	mode: 'on-demand',
	priority: 950,
	batchSize: 1,
	offline: { read: 'fail-if-missing', write: 'queue' },
};
const orderLookupPolicy: ReplicationPolicy = {
	mode: 'on-demand',
	priority: 900,
	batchSize: 1,
	offline: { read: 'fail-if-missing', write: 'queue' },
};
const taxRatesPolicy: ReplicationPolicy = {
	mode: 'greedy',
	priority: 1000,
	batchSize: 10,
	maxRequests: 5,
	offline: { read: 'fail-if-missing', write: 'reject' },
};

export const queryRequirementLibraryScenarios: QueryRequirementLibraryScenario[] = [
	{
		id: 'query-library-startup-declarations',
		label: 'Startup component declarations',
		description:
			'POS shell components declare customer, order, and tax-rate requirements before the flow serves covered records locally and schedules missing tax rates remotely.',
		connectivity: 'online',
		coverageState: {
			records: [
				{ collection: 'customers', id: 'customer:default', fresh: true },
				{ collection: 'orders', id: 'woo-order:114', fresh: true },
			],
			lanes: [],
		},
		declarations: [
			{
				componentId: 'CartBootstrap',
				id: 'customers.default',
				collection: 'customers',
				kind: 'targeted-records',
				queryKey: 'customers:ids:default',
				ids: ['customer:default'],
				coverageStrategy: 'record-and-lane',
				policy: defaultCustomerPolicy,
			},
			{
				componentId: 'DeepLinkRouter',
				id: 'orders.deepLink.114',
				collection: 'orders',
				kind: 'targeted-records',
				queryKey: 'orders:ids:114',
				ids: ['woo-order:114'],
				wooIds: [114],
				coverageStrategy: 'record-and-lane',
				policy: orderLookupPolicy,
			},
			{
				componentId: 'TaxSettingsProvider',
				id: 'taxRates.all',
				collection: 'taxRates',
				kind: 'lane',
				queryKey: 'taxRates:all',
				coverageStrategy: 'record-and-lane',
				policy: taxRatesPolicy,
			},
		],
	},
	{
		id: 'query-library-product-search-coalescing',
		label: 'Product search query coalescing',
		description:
			'Product grid and search box declare the same product query; the adapter coalesces them and preserves the interactive search priority.',
		connectivity: 'online',
		coverageState: {
			records: [{ collection: 'products', id: 'product:alpha', fresh: true }],
			lanes: [
				{
					collection: 'products',
					queryKey: 'products:search:keyboard',
					complete: true,
					fresh: true,
				},
			],
		},
		declarations: [
			{
				componentId: 'ProductGrid',
				id: 'products.search.keyboard',
				collection: 'products',
				kind: 'query',
				queryKey: 'products:search:keyboard',
				expectedRecordIds: ['product:alpha'],
				coverageStrategy: 'record-and-lane',
				policy: serveLocalPolicy,
			},
			{
				componentId: 'ProductSearchBox',
				id: 'products.search.keyboard',
				collection: 'products',
				kind: 'query',
				queryKey: 'products:search:keyboard',
				expectedRecordIds: ['product:keyboard'],
				coverageStrategy: 'record-and-lane',
				policy: { ...serveLocalPolicy, priority: 900 },
			},
		],
	},

	{
		id: 'query-library-current-total-evidence',
		label: 'Product query current total evidence',
		description:
			'Product grid declarations carry current visible IDs and query totals so record-and-lane coverage rejects a stale complete lane before scheduler seeding.',
		connectivity: 'online',
		coverageState: {
			records: [
				{ collection: 'products', id: 'product:alpha', fresh: true },
				{ collection: 'products', id: 'product:beta', fresh: true },
			],
			lanes: [
				{ collection: 'products', queryKey: 'products:search:coffee', complete: true, fresh: true },
			],
		},
		declarations: [
			{
				componentId: 'ProductGrid',
				id: 'products.search.coffee',
				collection: 'products',
				kind: 'query',
				queryKey: 'products:search:coffee',
				expectedRecordIds: ['product:alpha', 'product:beta'],
				currentRecordIds: ['product:alpha', 'product:beta'],
				totalMatchingRecords: 3,
				coverageStrategy: 'record-and-lane',
				policy: { ...serveLocalPolicy, priority: 850 },
			},
		],
	},
	{
		id: 'query-library-targeted-order-local-hit',
		label: 'Targeted order local hit',
		description:
			'An order detail route declares a targeted order lookup that coverage can serve without scheduling remote work.',
		connectivity: 'online',
		coverageState: {
			records: [{ collection: 'orders', id: 'woo-order:114', fresh: true }],
			lanes: [],
		},
		declarations: [
			{
				componentId: 'OrderDetailsRoute',
				id: 'orders.deepLink.114',
				collection: 'orders',
				kind: 'targeted-records',
				queryKey: 'orders:ids:114',
				ids: ['woo-order:114'],
				wooIds: [114],
				coverageStrategy: 'record-and-lane',
				policy: orderLookupPolicy,
			},
		],
	},
];

async function deterministicFetcher(task: FetchTask): Promise<FetchTaskResult> {
	return {
		taskId: task.id,
		documentCount: task.ids?.length ?? task.limit,
		requestCount: 1,
		completed: true,
	};
}

export function runQueryRequirementLibraryScenario(
	scenario: QueryRequirementLibraryScenario
): Promise<QueryRequirementFlowResult> {
	return runQueryRequirementFlow({
		connectivity: scenario.connectivity,
		coverageState: scenario.coverageState,
		declarations: scenario.declarations,
		fetcher: deterministicFetcher,
	});
}

export function summarizeQueryRequirementFlowResult(
	scenario: QueryRequirementLibraryScenario,
	result: QueryRequirementFlowResult
): string {
	const summary = result.coverageFlow.summary;
	return `declarations ${scenario.declarations.length} · coalesced ${result.requirements.length} · served local ${summary.servedLocal} · remote tasks ${summary.remoteTasks} · skipped ${summary.skipped} · requests ${summary.totalRequests} · docs ${summary.totalDocuments}`;
}

export async function summarizeQueryRequirementLibraryScenario(
	scenario: QueryRequirementLibraryScenario
): Promise<string> {
	return summarizeQueryRequirementFlowResult(
		scenario,
		await runQueryRequirementLibraryScenario(scenario)
	);
}
