import type { CoverageEvaluationCase } from './coverage-model';

export const coverageScenarios: CoverageEvaluationCase[] = [
	{
		id: 'historical-order-targeted-local-hit',
		label: 'Historical order lookup · local record hit',
		requirement: {
			id: 'orders.historicalLookup',
			collection: 'orders',
			kind: 'targeted-records',
			queryKey: 'orders:ids:historical-search',
			ids: ['woo-order:114'],
			policy: {
				mode: 'on-demand',
				priority: 900,
				batchSize: 1,
				offline: { read: 'fail-if-missing', write: 'queue' },
			},
		},
		state: {
			records: [{ collection: 'orders', id: 'woo-order:114', fresh: true }],
			lanes: [],
		},
	},
	{
		id: 'product-initial-lane-missing-record',
		label: 'Initial product lane · missing one expected record',
		requirement: {
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
		expectedRecordIds: ['product:alpha', 'product:missing'],
		state: {
			records: [{ collection: 'products', id: 'product:alpha', fresh: true }],
			lanes: [
				{
					collection: 'products',
					queryKey: 'products:initial:alphabetical',
					complete: true,
					fresh: true,
				},
			],
		},
	},
	{
		id: 'open-orders-lane-complete',
		label: 'Open orders lane · complete and fresh',
		requirement: {
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
		expectedRecordIds: ['woo-order:open-1', 'woo-order:open-2'],
		state: {
			records: [
				{ collection: 'orders', id: 'woo-order:open-1', fresh: true },
				{ collection: 'orders', id: 'woo-order:open-2', fresh: true },
			],
			lanes: [
				{
					collection: 'orders',
					queryKey: 'orders:status:open-recent',
					complete: true,
					fresh: true,
				},
			],
		},
	},
	{
		id: 'product-lane-new-total-exceeds-coverage',
		label: 'Product category lane · newer total exceeds complete lane',
		requirement: {
			id: 'products.categoryCoffee',
			collection: 'products',
			kind: 'query',
			queryKey: 'products:category:coffee',
			policy: {
				mode: 'windowed',
				priority: 700,
				batchSize: 10,
				offline: { read: 'serve-local', write: 'queue' },
			},
		},
		expectedRecordIds: ['product:alpha', 'product:beta'],
		currentRecordIds: ['product:alpha', 'product:beta'],
		totalMatchingRecords: 3,
		state: {
			records: [
				{ collection: 'products', id: 'product:alpha', fresh: true },
				{ collection: 'products', id: 'product:beta', fresh: true },
			],
			lanes: [
				{
					collection: 'products',
					queryKey: 'products:category:coffee',
					complete: true,
					fresh: true,
				},
			],
		},
	},
];
