import type { ReplicationRequirement } from './replication-policy';

export type SchedulerScenarioDefinition = {
	id: string;
	label: string;
	description: string;
	requirements: ReplicationRequirement[];
};

export const schedulerScenarios: SchedulerScenarioDefinition[] = [
	{
		id: 'pos-startup-constrained-host',
		label: 'POS startup · constrained host',
		description:
			'Models startup dependencies and low-priority background work without downloading historical orders by default.',
		requirements: [
			{
				id: 'taxRates.all',
				collection: 'taxRates',
				kind: 'lane',
				queryKey: 'taxRates:all',
				policy: {
					mode: 'greedy',
					priority: 1000,
					batchSize: 10,
					maxRequests: 5,
					offline: { read: 'fail-if-missing', write: 'reject' },
				},
			},
			{
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
			},
			{
				id: 'orders.deepLink',
				collection: 'orders',
				kind: 'targeted-records',
				queryKey: 'orders:ids:deep-link',
				ids: ['woo-order:114'],
				policy: {
					mode: 'on-demand',
					priority: 900,
					batchSize: 1,
					offline: { read: 'fail-if-missing', write: 'queue' },
				},
			},
			{
				id: 'products.initialAlphabetical',
				collection: 'products',
				kind: 'query',
				queryKey: 'products:initial:alphabetical',
				policy: {
					mode: 'windowed',
					priority: 700,
					batchSize: 10,
					offline: { read: 'serve-local', write: 'queue' },
				},
			},
			{
				id: 'orders.openRecent',
				collection: 'orders',
				kind: 'query',
				queryKey: 'orders:status:open-recent',
				policy: {
					mode: 'windowed',
					priority: 600,
					batchSize: 25,
					offline: { read: 'serve-local', write: 'queue' },
				},
			},
			{
				id: 'products.backgroundPoll',
				collection: 'products',
				kind: 'lane',
				queryKey: 'products:background-poll',
				policy: {
					mode: 'windowed',
					priority: 100,
					batchSize: 25,
					pollingIntervalMs: 120_000,
					offline: { read: 'serve-local', write: 'queue' },
				},
			},
		],
	},
];
