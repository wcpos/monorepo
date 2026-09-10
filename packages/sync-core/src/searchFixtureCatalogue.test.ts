import { describe, expect, it } from 'vitest';

import {
	SEARCH_FIXTURE_PRODUCTS,
	SEARCH_FIXTURE_TRAPS,
	searchFixtureExpectedIds,
	searchFixturePayload,
} from './searchFixtureCatalogue';

describe('search fixture catalogue', () => {
	it('has unique ids and every trap names an existing product', () => {
		const ids = SEARCH_FIXTURE_PRODUCTS.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const trap of SEARCH_FIXTURE_TRAPS) {
			for (const id of trap.expectedIds) expect(ids).toContain(id);
		}
	});

	it.each(SEARCH_FIXTURE_TRAPS.map((trap) => [trap.name, trap] as const))(
		'trap %s agrees with the reference matcher',
		(_name, trap) => {
			// The table is hand-written so a reader can see the intent; the matcher encodes the
			// contract. They must agree, or one of them is wrong.
			expect(searchFixtureExpectedIds(trap.query)).toEqual(trap.expectedIds);
		}
	);

	it('carries the over-100 trap the walk tests need', () => {
		const trap = SEARCH_FIXTURE_TRAPS.find((t) => t.name === 'over-100-hits');
		expect(trap?.expectedIds.length).toBeGreaterThan(100);
	});

	it('builds a payload with a uuid-shaped identity meta', () => {
		const payload = searchFixturePayload(SEARCH_FIXTURE_PRODUCTS[0]);
		const meta = (payload.meta_data as { key: string; value: string }[]).find(
			(m) => m.key === '_woocommerce_pos_uuid'
		);
		expect(meta?.value).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
		);
	});
});
