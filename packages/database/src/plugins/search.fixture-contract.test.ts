import { Index } from 'flexsearch';

import { encodeSearchText, FLEXSEARCH_MIN_TERM_LENGTH, foldSearchText } from '@wcpos/sync-core';
import {
	SEARCH_FIXTURE_PRODUCTS,
	SEARCH_FIXTURE_TRAPS,
	searchFixtureBlob,
} from '@wcpos/sync-core/testing';

// Mirrors createSearchInstance's indexOptions (see search.test.ts 'tokenizer behaviour').
function buildIndex() {
	// The same shape search.test.ts uses: a const object, not an inline literal, because
	// flexsearch's IndexOptions type does not declare `minlength` although the runtime reads it.
	const indexOptions = {
		preset: 'performance',
		tokenize: 'full',
		minlength: FLEXSEARCH_MIN_TERM_LENGTH,
		encode: encodeSearchText,
	} as const;
	const index = new Index(indexOptions);
	for (const p of SEARCH_FIXTURE_PRODUCTS) index.add(p.id, searchFixtureBlob(p));
	return index;
}

describe('FlexSearch index against the search fixture traps', () => {
	const index = buildIndex();
	const indexed = SEARCH_FIXTURE_TRAPS.filter(
		(t) => foldSearchText(t.query).length >= FLEXSEARCH_MIN_TERM_LENGTH
	);
	const short = SEARCH_FIXTURE_TRAPS.filter(
		(t) => foldSearchText(t.query).length < FLEXSEARCH_MIN_TERM_LENGTH
	);

	it.each(indexed.map((t) => [t.name, t] as const))('%s', (_name, trap) => {
		// FlexSearch returns a set in its own order; ranking is asserted at the server and the walk.
		const ids = index.search(trap.query, { limit: 1000 }) as number[];
		expect([...ids].sort((a, b) => a - b)).toEqual([...trap.expectedIds].sort((a, b) => a - b));
	});

	it.each(short.map((t) => [t.name, t] as const))(
		"%s is under minlength and is the short-prefix path's job, not the index's",
		(_name, trap) => {
			expect(index.search(trap.query)).toEqual([]);
		}
	);
});
