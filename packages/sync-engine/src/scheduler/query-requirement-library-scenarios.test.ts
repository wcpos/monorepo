// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
	queryRequirementLibraryScenarios,
	runQueryRequirementLibraryScenario,
	summarizeQueryRequirementLibraryScenario,
} from './query-requirement-library-scenarios';

describe('queryRequirementLibraryScenarios', () => {
	it('declares a non-empty catalog of unique scenario ids', () => {
		const ids = queryRequirementLibraryScenarios.map((scenario) => scenario.id);
		expect(ids.length).toBeGreaterThan(0);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('coalesces product query declarations before scheduler coverage flow runs', async () => {
		const scenario = queryRequirementLibraryScenarios.find(
			(item) => item.id === 'query-library-product-search-coalescing'
		);

		expect(scenario).toBeDefined();
		const result = await runQueryRequirementLibraryScenario(scenario!);

		expect(result.requirements).toHaveLength(1);
		expect(result.requirements[0].declaredBy).toEqual(['ProductGrid', 'ProductSearchBox']);
		expect(result.requirements[0].requirement.policy.priority).toBe(900);
		expect(result.coverageFlow.scheduler.tasks.map((task) => task.requirementId)).toEqual([
			'products.search.keyboard',
		]);
	});

	it('keeps stale complete-lane query evidence remote after query-library declaration coalescing', async () => {
		const scenario = queryRequirementLibraryScenarios.find(
			(item) => item.id === 'query-library-current-total-evidence'
		);

		expect(scenario).toBeDefined();
		const result = await runQueryRequirementLibraryScenario(scenario!);

		expect(result.requirements).toHaveLength(1);
		expect(result.requirements[0].currentRecordIds).toEqual(['product:alpha', 'product:beta']);
		expect(result.requirements[0].totalMatchingRecords).toBe(3);
		expect(result.coverageFlow.servedLocal).toEqual([]);
		expect(result.coverageFlow.coverageDecisions[0]).toMatchObject({
			action: 'fetch-remote',
			reason: 'current query evidence proves more matching records than the complete lane expected',
		});
		expect(result.coverageFlow.scheduler.tasks.map((task) => task.requirementId)).toEqual([
			'products.search.coffee',
		]);
	});

	it('summarizes startup declarations across local coverage and remote scheduler work', async () => {
		const scenario = queryRequirementLibraryScenarios.find(
			(item) => item.id === 'query-library-startup-declarations'
		);

		expect(scenario).toBeDefined();
		await expect(summarizeQueryRequirementLibraryScenario(scenario!)).resolves.toBe(
			'declarations 3 · coalesced 3 · served local 2 · remote tasks 1 · skipped 0 · requests 1 · docs 10'
		);
	});
});
