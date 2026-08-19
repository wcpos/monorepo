// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
	laneKeyFor,
	posBootstrapTasks,
	REFERENCE_LANE_CONFIGS,
	referenceLaneTaskFor,
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
		expect(tax?.documentIds).toBeUndefined();
		expect((tax?.limit ?? 0) > 0).toBe(true);
	});

	it('only seeds tax rates — reference collections and historical data stay on-demand', () => {
		const tasks = posBootstrapTasks();
		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.collection).toBe('taxRates');
	});
});

describe('laneKeyFor', () => {
	it.each(['categories', 'brands', 'tags', 'coupons'] as const)(
		'returns the %s greedy reference lane key',
		(collection) => {
			expect(laneKeyFor(collection)).toBe(REFERENCE_LANE_CONFIGS[collection].config.queryKey);
		}
	);

	it('returns the tax-rate boot lane key and null for other collections', () => {
		expect(laneKeyFor('taxRates')).toBe('taxRates:all');
		expect(laneKeyFor('products')).toBeNull();
	});
});

describe('referenceLaneTaskFor (change-signal reference refresh)', () => {
	it.each(['coupons', 'categories', 'brands', 'tags'] as const)(
		'returns ONLY the greedy %s:all lane',
		(collection) => {
			const task = referenceLaneTaskFor(collection);

			expect(task).toMatchObject({ collection, queryKey: `${collection}:all`, mode: 'greedy' });
		}
	);
});
