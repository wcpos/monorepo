// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
	queryTotalDiscoveryScenarios,
	summarizeQueryTotalDiscoveryScenarios,
} from './query-total-discovery-scenarios';

describe('queryTotalDiscoveryScenarios', () => {
	it('covers bounded, exact-limit, request-total, and query-total outcomes', () => {
		const summaries = summarizeQueryTotalDiscoveryScenarios();

		expect(summaries.map((summary) => summary.action)).toEqual([
			'record-complete-lane',
			'record-complete-lane',
			'request-query-total',
			'record-complete-lane',
			'record-incomplete-lane',
		]);
		expect(summaries.map((summary) => summary.complete)).toEqual([true, true, false, true, false]);
		expect(summaries[2].shouldRequestQueryTotal).toBe(true);
		expect(summaries[4].totalMatchingRecords).toBe(75);
	});
});
