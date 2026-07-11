// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
	coverageCleanupScenarios,
	summarizeCoverageCleanupScenarios,
} from './coverage-cleanup-scenarios';
import { planCoverageCleanup } from './coverage-cleanup';

describe('coverageCleanupScenarios', () => {
	it('declares a non-empty catalog of unique scenario ids', () => {
		const ids = coverageCleanupScenarios.map((scenario) => scenario.id);
		expect(ids.length).toBeGreaterThan(0);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('encodes stale expected records as refresh work', () => {
		const scenario = coverageCleanupScenarios.find(
			(item) => item.id === 'open-orders-stale-expected-record'
		);
		expect(scenario).toBeDefined();

		const decisions = planCoverageCleanup(scenario!.input);
		expect(decisions).toEqual([
			{
				recordId: 'woo-order:open-1',
				action: 'refresh',
				reason: 'record is expected by lane but stale',
			},
			{
				recordId: 'woo-order:open-2',
				action: 'keep',
				reason: 'record is expected by lane and fresh',
			},
		]);
	});

	it('summarizes cleanup actions per scenario for the lab table', () => {
		expect(summarizeCoverageCleanupScenarios(coverageCleanupScenarios)).toEqual([
			{ scenarioId: 'open-orders-stale-expected-record', keep: 1, refresh: 1, remove: 0 },
			{ scenarioId: 'product-lane-out-of-lane-record', keep: 1, refresh: 0, remove: 1 },
			{ scenarioId: 'orders-lane-mixed-cleanup', keep: 1, refresh: 1, remove: 1 },
		]);
	});
});
