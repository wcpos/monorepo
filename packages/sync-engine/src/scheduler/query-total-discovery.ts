import { deriveQueryCoverageCompleteness } from './query-coverage-writes';

export type QueryTotalDiscoveryAction =
	| 'wait-for-settled-query'
	| 'wait-for-catalog-complete'
	| 'request-query-total'
	| 'record-incomplete-lane'
	| 'record-complete-lane';

export type QueryTotalDiscoveryInput = {
	queryKey: string;
	returnedRecordCount: number;
	limit: number;
	querySettled: boolean;
	localCatalogComplete: boolean;
	catalogTotal: number | null;
	queryHasFilters: boolean;
	querySpecificTotal: number | null;
};

export type QueryTotalDiscoveryDecision = {
	queryKey: string;
	action: QueryTotalDiscoveryAction;
	reason: string;
	complete: boolean;
	shouldRequestQueryTotal: boolean;
	totalMatchingRecords: number | null;
};

function decision(
	input: QueryTotalDiscoveryInput,
	output: Omit<QueryTotalDiscoveryDecision, 'queryKey'>
): QueryTotalDiscoveryDecision {
	return { queryKey: input.queryKey, ...output };
}

export function planQueryTotalDiscovery(
	input: QueryTotalDiscoveryInput
): QueryTotalDiscoveryDecision {
	if (!input.querySettled) {
		return decision(input, {
			action: 'wait-for-settled-query',
			reason: 'rendered RxDB query has not settled yet',
			complete: false,
			shouldRequestQueryTotal: false,
			totalMatchingRecords: null,
		});
	}

	if (!input.localCatalogComplete) {
		return decision(input, {
			action: 'wait-for-catalog-complete',
			reason: 'local catalog is not complete enough to trust rendered query results',
			complete: false,
			shouldRequestQueryTotal: false,
			totalMatchingRecords: null,
		});
	}

	if (input.returnedRecordCount < input.limit) {
		return decision(input, {
			action: 'record-complete-lane',
			reason: 'returned records are below the page limit, so the rendered query is bounded locally',
			complete: true,
			shouldRequestQueryTotal: false,
			totalMatchingRecords: input.returnedRecordCount,
		});
	}

	const totalMatchingRecords = input.queryHasFilters
		? input.querySpecificTotal
		: input.catalogTotal;
	if (totalMatchingRecords === null) {
		return decision(input, {
			action: input.queryHasFilters ? 'request-query-total' : 'record-incomplete-lane',
			reason: input.queryHasFilters
				? 'filtered exact-limit query needs a query-specific Woo total before expected ids are trusted'
				: 'exact-limit unfiltered query has no catalog total evidence',
			complete: false,
			shouldRequestQueryTotal: input.queryHasFilters,
			totalMatchingRecords: null,
		});
	}

	const complete = deriveQueryCoverageCompleteness({
		returnedRecordCount: input.returnedRecordCount,
		totalMatchingRecords,
	});

	return decision(input, {
		action: complete ? 'record-complete-lane' : 'record-incomplete-lane',
		reason: complete
			? 'known matching total equals returned records'
			: 'known matching total is larger than the visible records',
		complete,
		shouldRequestQueryTotal: false,
		totalMatchingRecords,
	});
}
