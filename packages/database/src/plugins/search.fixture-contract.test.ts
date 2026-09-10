import { Index } from 'flexsearch';

import { encodeSearchText, foldSearchText } from '@wcpos/sync-core';
import {
	SEARCH_FIXTURE_PRODUCTS,
	SEARCH_FIXTURE_TRAPS,
	searchFixtureBlob,
} from '@wcpos/sync-core/testing';

// Mirrors createSearchInstance's indexOptions (see search.test.ts 'tokenizer behaviour').
function buildIndex() {
	const index = new Index({
		preset: 'performance',
		tokenize: 'full',
		minlength: 3,
		encode: encodeSearchText,
	} as const);
	for (const p of SEARCH_FIXTURE_PRODUCTS) index.add(p.id, searchFixtureBlob(p));
	return index;
}

describe('FlexSearch index against the search fixture traps', () => {
	const index = buildIndex();
	const indexed = SEARCH_FIXTURE_TRAPS.filter((t) => foldSearchText(t.query).length >= 3);
	const short = SEARCH_FIXTURE_TRAPS.filter((t) => foldSearchText(t.query).length < 3);

	it.each(indexed.map((t) => [t.name, t] as const))('%s', (_name, trap) => {
		// FlexSearch returns a set in its own order; ranking is asserted at the server and the walk.
		expect([...index.search(trap.query, { limit: 1000 })].sort((a, b) => a - b)).toEqual(
			[...trap.expectedIds].sort((a, b) => a - b)
		);
	});

	it.each(short.map((t) => [t.name, t] as const))(
		"%s is under minlength and is the short-prefix path's job, not the index's",
		(_name, trap) => {
			expect(index.search(trap.query)).toEqual([]);
		}
	);
});
