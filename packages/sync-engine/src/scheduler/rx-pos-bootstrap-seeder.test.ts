// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
	posBootstrapTasks,
	referenceLaneTaskFor,
	referenceLaneTasks,
} from './rx-pos-bootstrap-seeder';

describe('posBootstrapTasks', () => {
	it('seeds the greedy tax-rates lane at top priority (Tier 0 — the POS cannot sell without tax rates)', () => {
		const tasks = posBootstrapTasks();
		const tax = tasks.find((task) => task.collection === 'taxRates');

		expect(tax).toBeDefined();
		// The tax-rate scheduler fetcher only accepts queryKey 'taxRates:all' + mode
		// 'greedy' + NO targeted ids (isSupportedTaxRateSchedulerTask). Priority 1000
		// is the canonical Tier-0 value (schedulerScenarios.ts 'POS startup').
		expect(tax).toMatchObject({
			requirementId: 'taxRates.all',
			collection: 'taxRates',
			queryKey: 'taxRates:all',
			mode: 'greedy',
			priority: 1000,
		});
		expect(tax?.ids).toBeUndefined();
		expect((tax?.limit ?? 0) > 0).toBe(true);
	});

	it('only seeds tax rates — reference collections and historical data stay on-demand', () => {
		const tasks = posBootstrapTasks();
		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.collection).toBe('taxRates');
	});
});

describe('referenceLaneTasks (F11 — in-session reference refresh)', () => {
	it('returns ONLY the greedy categories + brands + tags + coupons lanes (not tax rates)', () => {
		const tasks = referenceLaneTasks();
		const collections = tasks.map((task) => task.collection).sort();

		expect(collections).toEqual(['brands', 'categories', 'coupons', 'tags']);
		expect(tasks.every((task) => task.mode === 'greedy')).toBe(true);
		expect(tasks.some((task) => task.collection === 'taxRates')).toBe(false); // tax rates have their own change-signal refresh
	});
});

describe('referenceLaneTaskFor (change-signal reference refresh)', () => {
	it.each(['coupons', 'categories', 'brands', 'tags'] as const)(
		'returns ONLY the greedy %s:all lane, identical to the one in referenceLaneTasks',
		(collection) => {
			const task = referenceLaneTaskFor(collection);

			expect(task).toMatchObject({ collection, queryKey: `${collection}:all`, mode: 'greedy' });
			// Re-seeding must re-queue the SAME task id the boot lane uses, so a refresh
			// reconciles the existing greedy lane rather than forking a duplicate.
			const bootTask = referenceLaneTasks().find((t) => t.collection === collection);
			expect(task).toEqual(bootTask);
		}
	);
});
