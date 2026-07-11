// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
	runSchedulerCoverageFlowScenario,
	schedulerCoverageFlowScenarios,
	summarizeSchedulerCoverageFlowScenario,
} from './scheduler-coverage-flow-scenarios';

describe('schedulerCoverageFlowScenarios', () => {
	it('declares a non-empty catalog of unique scenario ids', () => {
		const ids = schedulerCoverageFlowScenarios.map((scenario) => scenario.id);
		expect(ids.length).toBeGreaterThan(0);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('runs the product search preemption scenario with search before background poll', async () => {
		const scenario = schedulerCoverageFlowScenarios.find(
			(item) => item.id === 'product-search-preemption'
		);

		expect(scenario).toBeDefined();
		const result = await runSchedulerCoverageFlowScenario(scenario!);

		expect(result.scheduler.tasks.map((task) => task.requirementId)).toEqual([
			'products.search.keyboard',
			'products.backgroundPoll',
		]);
		expect(result.summary.remoteTasks).toBe(2);
	});

	it('summarizes served local, remote, skipped, request, and document counts', async () => {
		const scenario = schedulerCoverageFlowScenarios.find(
			(item) => item.id === 'offline-local-only'
		);

		expect(scenario).toBeDefined();
		await expect(summarizeSchedulerCoverageFlowScenario(scenario!)).resolves.toBe(
			'served local 1 · remote tasks 0 · skipped 1 · requests 0 · docs 0'
		);
	});
});
