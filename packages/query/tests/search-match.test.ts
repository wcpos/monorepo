import { foldSearchText } from '@wcpos/sync-core';
import { SEARCH_FIXTURE_PRODUCTS, SEARCH_FIXTURE_TRAPS } from '@wcpos/sync-core/testing';

import { fieldsMatchSearch, fieldsMatchShortPrefix } from '../src/search-match';

const FIELDS = (p: (typeof SEARCH_FIXTURE_PRODUCTS)[number]) => [p.name, p.sku, p.barcode];

describe('scan-fallback matcher against the fixture traps', () => {
	it.each(SEARCH_FIXTURE_TRAPS.map((t) => [t.name, t] as const))('%s', (_name, trap) => {
		const short = foldSearchText(trap.query).length < 3;
		const ids = SEARCH_FIXTURE_PRODUCTS.filter((p) =>
			short
				? fieldsMatchShortPrefix(FIELDS(p), foldSearchText(trap.query))
				: fieldsMatchSearch(FIELDS(p), trap.query)
		).map((p) => p.id);
		// The scan is a SET answer; ranking (exact first) is the server's and the index's job.
		expect([...ids].sort((a, b) => a - b)).toEqual([...trap.expectedIds].sort((a, b) => a - b));
	});
});
