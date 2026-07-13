// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { coverageScenarios } from './coverage-scenarios';
import { runCoverageComparison } from './coverage-model';

describe('coverageScenarios', () => {
	it('declares a non-empty catalog of unique scenario ids', () => {
		const ids = coverageScenarios.map((scenario) => scenario.id);
		expect(ids.length).toBeGreaterThan(0);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('encodes the product lane missing-record tradeoff', () => {
		const productScenario = coverageScenarios.find(
			(scenario) => scenario.id === 'product-initial-lane-missing-record'
		);
		expect(productScenario?.expectedRecordIds).toEqual(['product:alpha', 'product:missing']);

		const decisions = runCoverageComparison([productScenario!]);
		expect(decisions.map((decision) => `${decision.strategy}:${decision.action}`)).toEqual([
			'record-only:fetch-remote',
			'lane-only:serve-local',
			'record-and-lane:fetch-remote',
		]);
	});

	it('encodes stale complete-lane evidence when current totals prove more matches exist', () => {
		const staleLaneScenario = coverageScenarios.find(
			(scenario) => scenario.id === 'product-lane-new-total-exceeds-coverage'
		);
		expect(staleLaneScenario?.expectedRecordIds).toEqual(['product:alpha', 'product:beta']);
		expect(staleLaneScenario?.totalMatchingRecords).toBe(3);

		const decisions = runCoverageComparison([staleLaneScenario!]);
		expect(decisions.map((decision) => `${decision.strategy}:${decision.action}`)).toEqual([
			'record-only:serve-local',
			'lane-only:serve-local',
			'record-and-lane:fetch-remote',
		]);
	});
});
