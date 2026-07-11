// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
	coverageCompactionCadenceScenarios,
	summarizeCoverageCompactionCadenceScenarios,
} from './coverage-compaction-cadence-scenarios';

describe('coverageCompactionCadenceScenarios', () => {
	it('covers run, skip, wait, and takeover ownership decisions', () => {
		const summaries = summarizeCoverageCompactionCadenceScenarios();

		expect(summaries.map((summary) => summary.action)).toEqual([
			'run',
			'skip',
			'wait-for-owner',
			'take-over',
			'wait-for-failure-backoff',
		]);
		expect(summaries.map((summary) => summary.expiredDocuments)).toEqual([1, 0, 1, 1, 1]);
		expect(summaries[2].ownerId).toBe('tab-b');
		expect(summaries[3].previousOwnerId).toBe('tab-b');
		expect(summaries[4].nextDueAtMs).toBe(1_200);
	});
});
